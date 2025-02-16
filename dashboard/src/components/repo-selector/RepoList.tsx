import React, { useContext, useEffect, useState } from "react";
import styled from "styled-components";
import github from "assets/github.png";

import api from "shared/api";
import { ActionConfigType, RepoType } from "shared/types";
import { Context } from "shared/Context";

import Loading from "../Loading";
import SearchBar from "../SearchBar";

interface GithubAppAccessData {
  has_access: boolean;
  username?: string;
  accounts?: string[];
}

type Props = {
  actionConfig: ActionConfigType | null;
  setActionConfig: (x: ActionConfigType) => void;
  userId?: number;
  readOnly: boolean;
  filteredRepos?: string[];
};

const RepoList: React.FC<Props> = ({
  actionConfig,
  setActionConfig,
  userId,
  readOnly,
  filteredRepos,
}) => {
  const [repos, setRepos] = useState<RepoType[]>([]);
  const [repoLoading, setRepoLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [repoError, setRepoError] = useState(false);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState(false);
  const [accessData, setAccessData] = useState<GithubAppAccessData>({
    has_access: false,
  });
  const [searchFilter, setSearchFilter] = useState(null);
  const { currentProject } = useContext(Context);

  const loadData = async () => {
    try {
      const { data } = await api.getGithubAccounts("<token>", {}, {});

      setAccessData(data);
      setAccessLoading(false);
    } catch (error) {
      setAccessError(true);
      setAccessLoading(false);
    }

    let ids: number[] = [];

    if (!userId && userId !== 0) {
      ids = await api
        .getGitRepos("token", {}, { project_id: currentProject.id })
        .then((res) => res.data);
    } else {
      setRepoLoading(false);
      setRepoError(true);
      return;
    }

    const repoListPromises = ids.map((id) =>
      api.getGitRepoList(
        "<token>",
        {},
        { project_id: currentProject.id, git_repo_id: id }
      )
    );

    try {
      const resolvedRepoList = await Promise.allSettled(repoListPromises);

      const repos: RepoType[][] = resolvedRepoList.map((repo) =>
        repo.status === "fulfilled" ? repo.value.data : []
      );

      const names = new Set();
      // note: would be better to use .flat() here but you need es2019 for
      setRepos(
        repos
          .map((arr, idx) =>
            arr.map((el) => {
              el.GHRepoID = ids[idx];
              return el;
            })
          )
          .reduce((acc, val) => acc.concat(val), [])
          .reduce((acc, val) => {
            if (!names.has(val.FullName)) {
              names.add(val.FullName);
              return acc.concat(val);
            } else {
              return acc;
            }
          }, [])
      );
      setRepoLoading(false);
    } catch (err) {
      setRepoLoading(false);
      setRepoError(true);
    }
  };

  // TODO: Try to unhook before unmount
  useEffect(() => {
    loadData();
  }, []);

  // clear out actionConfig and SelectedRepository if new search is performed
  useEffect(() => {
    setActionConfig({
      git_repo: null,
      image_repo_uri: null,
      git_branch: null,
      git_repo_id: 0,
    });
    setSelectedRepo(null);
  }, [searchFilter]);

  const setRepo = (x: RepoType) => {
    let updatedConfig = actionConfig;
    updatedConfig.git_repo = x.FullName;
    updatedConfig.git_repo_id = x.GHRepoID;
    setActionConfig(updatedConfig);
    setSelectedRepo(x.FullName);
  };

  const renderRepoList = () => {
    if (repoLoading || accessLoading) {
      return (
        <LoadingWrapper>
          <Loading />
        </LoadingWrapper>
      );
    } else if (repoError) {
      return <LoadingWrapper>Error loading repos.</LoadingWrapper>;
    } else if (repos.length == 0) {
      if (accessError) {
        return (
          <LoadingWrapper>
            No connected Github repos found.
            <A href={"/api/integrations/github-app/oauth"}>
              Authorize Porter to view your repositories.
            </A>
          </LoadingWrapper>
        );
      }

      if (accessData.accounts?.length === 0) {
        return (
          <LoadingWrapper>
            No connected Github repos found. You can
            <A href={"/api/integrations/github-app/install"}>
              Install Porter in more repositories
            </A>
            .
          </LoadingWrapper>
        );
      }
    }

    // show 10 most recently used repos if user hasn't searched anything yet
    let results =
      searchFilter != null
        ? repos.filter((repo: RepoType) => {
            return repo.FullName.toLowerCase().includes(
              searchFilter.toLowerCase() || ""
            );
          })
        : repos.slice(0, 10);

    if (results.length == 0) {
      return <LoadingWrapper>No matching Github repos found.</LoadingWrapper>;
    } else {
      return results.map((repo: RepoType, i: number) => {
        const shouldDisable = !!filteredRepos?.find(
          (filteredRepo) => repo.FullName === filteredRepo
        );
        return (
          <RepoName
            key={i}
            isSelected={repo.FullName === selectedRepo}
            lastItem={i === repos.length - 1}
            onClick={() => setRepo(repo)}
            readOnly={readOnly}
            disabled={shouldDisable}
          >
            <img src={github} alt={"github icon"} />
            {repo.FullName}
            {shouldDisable && ` - This repo was already added`}
          </RepoName>
        );
      });
    }
  };

  const renderExpanded = () => {
    if (readOnly) {
      return <ExpandedWrapperAlt>{renderRepoList()}</ExpandedWrapperAlt>;
    } else {
      return (
        <>
          <SearchBar
            setSearchFilter={setSearchFilter}
            disabled={repoError || repoLoading || accessError || accessLoading}
            prompt={"Search repos..."}
          />
          <RepoListWrapper>
            <ExpandedWrapper>{renderRepoList()}</ExpandedWrapper>
          </RepoListWrapper>
        </>
      );
    }
  };

  return <>{renderExpanded()}</>;
};

export default RepoList;

const RepoListWrapper = styled.div`
  border: 1px solid #ffffff55;
  border-radius: 3px;
  overflow-y: auto;
`;

type RepoNameProps = {
  lastItem: boolean;
  isSelected: boolean;
  readOnly: boolean;
  disabled: boolean;
};

const RepoName = styled.div<RepoNameProps>`
  display: flex;
  width: 100%;
  font-size: 13px;
  border-bottom: 1px solid
    ${(props) => (props.lastItem ? "#00000000" : "#606166")};
  color: ${(props) => (props.disabled ? "#ffffff88" : "#ffffff")};
  user-select: none;
  align-items: center;
  padding: 10px 0px;
  cursor: ${(props) =>
    props.readOnly || props.disabled ? "default" : "pointer"};
  pointer-events: ${(props) =>
    props.readOnly || props.disabled ? "none" : "auto"};

  ${(props) => {
    if (props.disabled) {
      return "";
    }

    if (props.isSelected) {
      return `background: #ffffff22;`;
    }

    return `background: #ffffff11;`;
  }}

  :hover {
    background: #ffffff22;

    > i {
      background: #ffffff22;
    }
  }

  > img,
  i {
    width: 18px;
    height: 18px;
    margin-left: 12px;
    margin-right: 12px;
    font-size: 20px;
  }
`;

const LoadingWrapper = styled.div`
  padding: 30px 0px;
  background: #ffffff11;
  display: flex;
  align-items: center;
  font-size: 13px;
  justify-content: center;
  color: #ffffff44;
`;

const ExpandedWrapper = styled.div`
  width: 100%;
  border-radius: 3px;
  border: 0px solid #ffffff44;
  max-height: 221px;
  top: 40px;

  > i {
    font-size: 18px;
    display: block;
    position: absolute;
    left: 10px;
    top: 10px;
  }
`;

const ExpandedWrapperAlt = styled(ExpandedWrapper)`
  border: 1px solid #ffffff44;
  max-height: 275px;
  overflow-y: auto;
`;

const A = styled.a`
  color: #8590ff;
  text-decoration: underline;
  margin-left: 5px;
  cursor: pointer;
`;
