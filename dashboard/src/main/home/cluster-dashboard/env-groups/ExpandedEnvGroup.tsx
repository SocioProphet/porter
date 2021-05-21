import React, { Component } from "react";
import styled from "styled-components";
import close from "assets/close.png";
import key from "assets/key.svg";
import _ from "lodash";

import { ChartType, StorageType, ClusterType } from "shared/types";
import { Context } from "shared/Context";
import api from "shared/api";

import SaveButton from "components/SaveButton";
import ConfirmOverlay from "components/ConfirmOverlay";
import Loading from "components/Loading";
import TabRegion from "components/TabRegion";
import EnvGroupArray, { KeyValueType } from "./EnvGroupArray";
import Heading from "components/values-form/Heading";
import Helper from "components/values-form/Helper";

type PropsType = {
  namespace: string;
  envGroup: any;
  currentCluster: ClusterType;
  closeExpanded: () => void;
};

type StateType = {
  loading: boolean;
  currentTab: string | null;
  showDeleteOverlay: boolean;
  deleting: boolean;
  saveValuesStatus: string | null;
  envVariables: KeyValueType[];
};

const tabOptions = [
  { value: "environment", label: "Environment Variables" },
  { value: "settings", label: "Settings" },
];

export default class ExpandedEnvGroup extends Component<PropsType, StateType> {
  state = {
    loading: true,
    currentTab: "environment",
    showDeleteOverlay: false,
    deleting: false,
    saveValuesStatus: null as string | null,
    envVariables: [] as KeyValueType[],
  };

  componentDidMount() {
    // parse env group props into values type
    let envVariables = [] as KeyValueType[];
    let envGroupData = this.props.envGroup.data;

    for (const key in envGroupData) {
      envVariables.push({
        key: key,
        value: envGroupData[key],
        hidden: envGroupData[key].includes("PORTERSECRET"),
        locked: envGroupData[key].includes("PORTERSECRET"),
        deleted: false,
      });
    }

    this.setState({ envVariables });
  }

  handleUpdateValues = () => {
    let { envGroup } = this.props;
    let name = envGroup.metadata.name;
    let namespace = envGroup.metadata.namespace;

    let apiEnvVariables: Record<string, string> = {};
    let secretEnvVariables: Record<string, string> = {};

    let envVariables = this.state.envVariables;

    envVariables
      .filter((envVar: KeyValueType, index: number, self: KeyValueType[]) => {
        // remove any collisions that are marked as deleted and are duplicates, unless they are
        // all delete collisions
        let numDeleteCollisions = self.reduce((n, _envVar: KeyValueType) => {
          return n + (_envVar.key === envVar.key && envVar.deleted ? 1 : 0);
        }, 0);

        let numCollisions = self.reduce((n, _envVar: KeyValueType) => {
          return n + (_envVar.key === envVar.key ? 1 : 0);
        }, 0);

        if (numCollisions == numDeleteCollisions) {
          // if all collisions are delete collisions, just remove duplicates
          return (
            index ===
            self.findIndex(
              (_envVar: KeyValueType) => _envVar.key === envVar.key
            )
          );
        } else if (numCollisions == 1) {
          // if there's just one collision (self), keep the object
          return true;
        } else {
          // if there are more collisions than delete collisions, remove all duplicates that
          // are deletions
          return (
            index ===
            self.findIndex(
              (_envVar: KeyValueType) =>
                _envVar.key === envVar.key && !_envVar.deleted
            )
          );
        }
      })
      .forEach((envVar: KeyValueType) => {
        if (envVar.hidden) {
          if (envVar.deleted) {
            secretEnvVariables[envVar.key] = null;
          } else if (!envVar.value.includes("PORTERSECRET")) {
            secretEnvVariables[envVar.key] = envVar.value;
          }
        } else {
          if (envVar.deleted) {
            apiEnvVariables[envVar.key] = null;
          } else {
            apiEnvVariables[envVar.key] = envVar.value;
          }
        }
      });

    this.setState({ saveValuesStatus: "loading" });
    api
      .updateConfigMap(
        "<token>",
        {
          name,
          namespace,
          variables: apiEnvVariables,
          secret_variables: secretEnvVariables,
        },
        {
          id: this.context.currentProject.id,
          cluster_id: this.props.currentCluster.id,
        }
      )
      .then((res) => {
        this.setState({ saveValuesStatus: "successful" });
      })
      .catch((err) => {
        this.setState({ saveValuesStatus: "error" });
      });
  };

  renderTabContents = () => {
    let currentTab = this.state.currentTab;
    let { envGroup, namespace } = this.props;
    let name = envGroup.metadata.name;

    switch (currentTab) {
      case "environment":
        return (
          <TabWrapper>
            <InnerWrapper>
              <Heading>Environment Variables</Heading>
              <Helper>
                Set environment variables for your secrets and
                environment-specific configuration.
              </Helper>
              <EnvGroupArray
                namespace={namespace}
                values={this.state.envVariables}
                setValues={(x: any) => this.setState({ envVariables: x })}
                fileUpload={true}
                secretOption={true}
              />
            </InnerWrapper>
            <SaveButton
              text="Update"
              onClick={() => this.handleUpdateValues()}
              status={this.state.saveValuesStatus}
              makeFlush={true}
            />
          </TabWrapper>
        );
      default:
        return (
          <TabWrapper>
            <InnerWrapper full={true}>
              <Heading>Manage Environment Group</Heading>
              <Helper>
                Permanently delete this set of environment variables. This
                action cannot be undone.
              </Helper>
              <Button
                color="#b91133"
                onClick={() => this.setState({ showDeleteOverlay: true })}
              >
                Delete {name}
              </Button>
            </InnerWrapper>
          </TabWrapper>
        );
    }
  };

  readableDate = (s: string) => {
    let ts = new Date(s);
    let date = ts.toLocaleDateString();
    let time = ts.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${time} on ${date}`;
  };

  handleDeleteEnvGroup = () => {
    let { envGroup } = this.props;
    let name = envGroup.metadata.name;
    let namespace = envGroup.metadata.namespace;

    this.setState({ deleting: true });
    api
      .deleteConfigMap(
        "<token>",
        {
          name,
          namespace,
          cluster_id: this.props.currentCluster.id,
        },
        { id: this.context.currentProject.id }
      )
      .then((res) => {
        this.props.closeExpanded();
        this.setState({ deleting: false });
      })
      .catch((err) => {
        this.setState({ deleting: false, showDeleteOverlay: false });
      });
  };

  renderDeleteOverlay = () => {
    if (this.state.deleting) {
      return (
        <DeleteOverlay>
          <Loading />
        </DeleteOverlay>
      );
    }
  };

  render() {
    let { closeExpanded } = this.props;
    let { envGroup } = this.props;
    let name = envGroup.metadata.name;
    let timestamp = envGroup.metadata.creationTimestamp;
    let namespace = envGroup.metadata.namespace;

    return (
      <>
        <CloseOverlay onClick={closeExpanded} />
        <StyledExpandedChart>
          <ConfirmOverlay
            show={this.state.showDeleteOverlay}
            message={`Are you sure you want to delete ${name}?`}
            onYes={this.handleDeleteEnvGroup}
            onNo={() => this.setState({ showDeleteOverlay: false })}
          />
          {this.renderDeleteOverlay()}

          <HeaderWrapper>
            <TitleSection>
              <Title>
                <IconWrapper>
                  <Icon src={key} />
                </IconWrapper>
                {name}
              </Title>
              <InfoWrapper>
                <LastDeployed>
                  Last updated {this.readableDate(timestamp)}
                </LastDeployed>
              </InfoWrapper>

              <TagWrapper>
                Namespace <NamespaceTag>{namespace}</NamespaceTag>
              </TagWrapper>
            </TitleSection>

            <CloseButton onClick={closeExpanded}>
              <CloseButtonImg src={close} />
            </CloseButton>
          </HeaderWrapper>

          <TabRegion
            currentTab={this.state.currentTab}
            setCurrentTab={(x: string) => this.setState({ currentTab: x })}
            options={tabOptions}
            color={null}
          >
            {this.renderTabContents()}
          </TabRegion>
        </StyledExpandedChart>
      </>
    );
  }
}

ExpandedEnvGroup.contextType = Context;

const Button = styled.button`
  height: 35px;
  font-size: 13px;
  margin-top: 5px;
  margin-bottom: 30px;
  font-weight: 500;
  font-family: "Work Sans", sans-serif;
  color: white;
  padding: 6px 20px 7px 20px;
  text-align: left;
  border: 0;
  border-radius: 5px;
  background: ${(props) => (!props.disabled ? props.color : "#aaaabb")};
  box-shadow: ${(props) =>
    !props.disabled ? "0 2px 5px 0 #00000030" : "none"};
  cursor: ${(props) => (!props.disabled ? "pointer" : "default")};
  user-select: none;
  :focus {
    outline: 0;
  }
  :hover {
    filter: ${(props) => (!props.disabled ? "brightness(120%)" : "")};
  }
`;

const InnerWrapper = styled.div<{ full?: boolean }>`
  width: 100%;
  height: ${(props) => (props.full ? "100%" : "calc(100% - 65px)")};
  background: #ffffff11;
  padding: 0 35px;
  padding-bottom: 50px;
  position: relative;
  border-radius: 5px;
  overflow: auto;
`;

const TabWrapper = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

const DeleteOverlay = styled.div`
  position: absolute;
  top: 0px;
  opacity: 100%;
  left: 0px;
  width: 100%;
  height: 100%;
  z-index: 999;
  display: flex;
  padding-bottom: 30px;
  align-items: center;
  justify-content: center;
  font-family: "Work Sans", sans-serif;
  font-size: 18px;
  font-weight: 500;
  color: white;
  flex-direction: column;
  background: rgb(0, 0, 0, 0.73);
  opacity: 0;
  animation: lindEnter 0.2s;
  animation-fill-mode: forwards;

  @keyframes lindEnter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const CloseOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #202227;
  animation: fadeIn 0.2s 0s;
  opacity: 0;
  animation-fill-mode: forwards;
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const HeaderWrapper = styled.div``;

const Dot = styled.div`
  margin-right: 9px;
  margin-left: 9px;
`;

const InfoWrapper = styled.div`
  display: flex;
  align-items: center;
  margin: 24px 0px 17px 0px;
  height: 20px;
`;

const LastDeployed = styled.div`
  font-size: 13px;
  margin-left: 0;
  margin-top: -1px;
  display: flex;
  align-items: center;
  color: #aaaabb66;
`;

const TagWrapper = styled.div`
  position: absolute;
  right: 0px;
  bottom: 0px;
  height: 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff44;
  border: 1px solid #ffffff44;
  border-radius: 3px;
  padding-left: 5px;
  background: #26282e;
`;

const NamespaceTag = styled.div`
  height: 20px;
  margin-left: 6px;
  color: #aaaabb;
  background: #43454a;
  border-radius: 3px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0px 6px;
  padding-left: 7px;
  border-top-left-radius: 0px;
  border-bottom-left-radius: 0px;
`;

const Icon = styled.img`
  width: 100%;
`;

const IconWrapper = styled.div`
  color: #efefef;
  font-size: 16px;
  height: 20px;
  width: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 3px;
  margin-right: 12px;

  > i {
    font-size: 20px;
  }
`;

const Title = styled.div`
  font-size: 18px;
  font-weight: 500;
  display: flex;
  align-items: center;
`;

const TitleSection = styled.div`
  width: 100%;
  position: relative;
`;

const CloseButton = styled.div`
  position: absolute;
  display: block;
  width: 40px;
  height: 40px;
  padding: 13px 0 12px 0;
  text-align: center;
  border-radius: 50%;
  right: 15px;
  top: 12px;
  cursor: pointer;
  :hover {
    background-color: #ffffff11;
  }
`;

const CloseButtonImg = styled.img`
  width: 14px;
  margin: 0 auto;
`;

const StyledExpandedChart = styled.div`
  width: calc(100% - 50px);
  height: calc(100% - 50px);
  z-index: 0;
  position: absolute;
  top: 25px;
  left: 25px;
  overflow: hidden;
  border-radius: 10px;
  background: #26272f;
  box-shadow: 0 5px 12px 4px #00000033;
  animation: floatIn 0.3s;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
  padding: 25px;
  display: flex;
  flex-direction: column;

  @keyframes floatIn {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0px);
    }
  }
`;
