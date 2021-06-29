import React, { Component } from "react";
import styled from "styled-components";
import yaml from "js-yaml";
import close from "assets/close.png";
import _ from "lodash";
import loading from "assets/loading.gif";

import { ChartType, StorageType, ClusterType } from "shared/types";
import { Context } from "shared/Context";
import api from "shared/api";

import SaveButton from "components/SaveButton";
import ConfirmOverlay from "components/ConfirmOverlay";
import Loading from "components/Loading";
import TabRegion from "components/TabRegion";
import JobList from "./jobs/JobList";
import SettingsSection from "./SettingsSection";
import FormWrapper from "components/values-form/FormWrapper";
import { PlaceHolder } from "brace";

type PropsType = {
  namespace: string;
  currentChart: ChartType;
  currentCluster: ClusterType;
  closeChart: () => void;
  setSidebar: (x: boolean) => void;
};

type StateType = {
  currentChart: ChartType;
  imageIsPlaceholder: boolean;
  newestImage: string;
  loading: boolean;
  jobs: any[];
  tabOptions: any[];
  tabContents: any;
  currentTab: string | null;
  websockets: Record<string, any>;
  showDeleteOverlay: boolean;
  deleting: boolean;
  saveValuesStatus: string | null;
  formData: any;
  valuesToOverride: any;
};

export default class ExpandedJobChart extends Component<PropsType, StateType> {
  state = {
    currentChart: this.props.currentChart,
    imageIsPlaceholder: false,
    newestImage: null as string,
    loading: true,
    jobs: [] as any[],
    tabOptions: [] as any[],
    tabContents: [] as any,
    currentTab: null as string | null,
    websockets: {} as Record<string, any>,
    showDeleteOverlay: false,
    deleting: false,
    saveValuesStatus: null as string | null,
    formData: {} as any,
    valuesToOverride: {} as any,
  };

  // Retrieve full chart data (includes form and values)
  getChartData = (chart: ChartType, revision: number) => {
    let { currentProject } = this.context;
    let { currentCluster, currentChart } = this.props;

    this.setState({ loading: true });
    api
      .getChart(
        "<token>",
        {
          namespace: currentChart.namespace,
          cluster_id: currentCluster.id,
          storage: StorageType.Secret,
        },
        {
          name: chart.name,
          revision: revision,
          id: currentProject.id,
        }
      )
      .then((res) => {
        let image = res.data?.config?.image?.repository;
        let tag = res.data?.config?.image?.tag.toString();
        let newestImage = tag ? image + ":" + tag : image;

        if (
          (image === "porterdev/hello-porter-job" ||
            image === "public.ecr.aws/o1j4x7p4/hello-porter-job") &&
          !this.state.newestImage
        ) {
          this.setState(
            {
              currentChart: res.data,
              loading: false,
              imageIsPlaceholder: true,
              newestImage: newestImage,
            },
            () => {
              this.updateTabs();
            }
          );
        } else {
          this.setState(
            {
              currentChart: res.data,
              loading: false,
              newestImage: newestImage,
            },
            () => {
              this.updateTabs();
            }
          );
        }
      })
      .catch(console.log);
  };

  refreshChart = (revision: number) =>
    this.getChartData(this.state.currentChart, revision);

  mergeNewJob = (newJob: any) => {
    let jobs = this.state.jobs;
    let exists = false;
    jobs.forEach((job: any, i: number, self: any[]) => {
      if (
        job.metadata?.name == newJob.metadata?.name &&
        job.metadata?.namespace == newJob.metadata?.namespace
      ) {
        self[i] = newJob;
        exists = true;
      }
    });

    if (!exists) {
      jobs.push(newJob);
    }

    this.sortJobsAndSave(jobs);
  };

  removeJob = (deletedJob: any) => {
    let jobs = this.state.jobs.filter((job) => {
      return deletedJob.metadata?.name !== job.metadata?.name;
    });

    this.sortJobsAndSave(jobs);
  };

  setupJobWebsocket = (chart: ChartType) => {
    let chartVersion = `${chart.chart.metadata.name}-${chart.chart.metadata.version}`;

    let { currentCluster, currentProject } = this.context;
    let protocol = window.location.protocol == "https:" ? "wss" : "ws";
    let ws = new WebSocket(
      `${protocol}://${window.location.host}/api/projects/${currentProject.id}/k8s/job/status?cluster_id=${currentCluster.id}`
    );
    ws.onopen = () => {
      console.log("connected to websocket");
    };

    ws.onmessage = (evt: MessageEvent) => {
      let event = JSON.parse(evt.data);
      let object = event.Object;
      object.metadata.kind = event.Kind;

      // if event type is add or update, merge with existing jobs
      if (event.event_type == "ADD" || event.event_type == "UPDATE") {
        // filter job belonging to chart
        let chartLabel = event.Object?.metadata?.labels["helm.sh/chart"];
        let releaseLabel =
          event.Object?.metadata?.labels["meta.helm.sh/release-name"];

        if (
          chartLabel &&
          releaseLabel &&
          chartLabel == chartVersion &&
          releaseLabel == chart.name
        ) {
          this.mergeNewJob(event.Object);
        }
      } else if (event.event_type == "DELETE") {
        // filter job belonging to chart
        let chartLabel = event.Object?.metadata?.labels["helm.sh/chart"];
        let releaseLabel =
          event.Object?.metadata?.labels["meta.helm.sh/release-name"];

        if (
          chartLabel &&
          releaseLabel &&
          chartLabel == chartVersion &&
          releaseLabel == chart.name
        ) {
          this.removeJob(event.Object);
        }
      }
    };

    ws.onclose = () => {
      console.log("closing websocket");
    };

    ws.onerror = (err: ErrorEvent) => {
      console.log(err);
      ws.close();
    };

    return ws;
  };

  setupCronJobWebsocket = (chart: ChartType) => {
    let releaseName = chart.name;
    let releaseNamespace = chart.namespace;

    let { currentCluster, currentProject } = this.context;
    let protocol = window.location.protocol == "https:" ? "wss" : "ws";
    let ws = new WebSocket(
      `${protocol}://${window.location.host}/api/projects/${currentProject.id}/k8s/cronjob/status?cluster_id=${currentCluster.id}`
    );
    ws.onopen = () => {
      console.log("connected to websocket");
    };

    ws.onmessage = (evt: MessageEvent) => {
      let event = JSON.parse(evt.data);
      let object = event.Object;
      object.metadata.kind = event.Kind;

      // if imageIsPlaceholder is true, update the newestImage and imageIsPlaceholder fields
      if (
        (event.event_type == "ADD" || event.event_type == "UPDATE") &&
        this.state.imageIsPlaceholder
      ) {
        // filter job belonging to chart
        let relNameAnn =
          event.Object?.metadata?.annotations["meta.helm.sh/release-name"];
        let relNamespaceAnn =
          event.Object?.metadata?.annotations["meta.helm.sh/release-namespace"];

        if (
          relNameAnn &&
          relNamespaceAnn &&
          releaseName == relNameAnn &&
          releaseNamespace == relNamespaceAnn
        ) {
          let newestImage =
            event.Object?.spec?.jobTemplate?.spec?.template?.spec?.containers[0]
              ?.image;
          if (
            newestImage &&
            newestImage !== "porterdev/hello-porter-job" &&
            newestImage !== "porterdev/hello-porter-job:latest" &&
            newestImage !== "public.ecr.aws/o1j4x7p4/hello-porter-job" &&
            newestImage !== "public.ecr.aws/o1j4x7p4/hello-porter-job:latest"
          ) {
            this.setState({ newestImage, imageIsPlaceholder: false });
          }
        }
      }
    };

    ws.onclose = () => {
      console.log("closing websocket");
    };

    ws.onerror = (err: ErrorEvent) => {
      console.log(err);
      ws.close();
    };

    return ws;
  };

  handleSaveValues = (config?: any, runJob?: boolean) => {
    let { currentCluster, setCurrentError, currentProject } = this.context;
    this.setState({ saveValuesStatus: "loading" });

    let conf: string;

    if (!config) {
      let values = {};
      let imageUrl = this.state.newestImage;
      let tag = null;

      if (imageUrl) {
        if (imageUrl.includes(":")) {
          let splits = imageUrl.split(":");
          imageUrl = splits[0];
          tag = splits[1].toString();
        } else if (!tag) {
          tag = "latest";
        }

        _.set(values, "image.repository", imageUrl);
        _.set(values, "image.tag", tag);
      }

      conf = yaml.dump({
        ...this.state.currentChart.config,
        ...values,
      });
    } else {
      // Convert dotted keys to nested objects
      let values = {};

      for (let key in config) {
        _.set(values, key, config[key]);
      }

      let imageUrl = this.state.newestImage;
      let tag = null as string;

      if (imageUrl) {
        if (imageUrl.includes(":")) {
          let splits = imageUrl.split(":");
          imageUrl = splits[0];
          tag = splits[1].toString();
        } else if (!tag) {
          tag = "latest";
        }

        _.set(values, "image.repository", imageUrl);
        _.set(values, "image.tag", `${tag}`);
      }

      if (runJob) {
        _.set(values, "paused", false);
      } else {
        _.set(values, "paused", true);
      }

      // Weave in preexisting values and convert to yaml
      conf = yaml.dump(
        {
          ...(this.state.currentChart.config as Object),
          ...values,
        },
        { forceQuotes: true }
      );
    }

    api
      .upgradeChartValues(
        "<token>",
        {
          namespace: this.state.currentChart.namespace,
          storage: StorageType.Secret,
          values: conf,
        },
        {
          id: currentProject.id,
          name: this.state.currentChart.name,
          cluster_id: currentCluster.id,
        }
      )
      .then((res) => {
        this.setState({ saveValuesStatus: "successful" });
        this.refreshChart(0);
      })
      .catch((err) => {
        let parsedErr =
          err?.response?.data?.errors && err.response.data.errors[0];

        if (parsedErr) {
          err = parsedErr;
        }

        this.setState({
          saveValuesStatus: parsedErr,
        });

        setCurrentError(parsedErr);
      });
  };

  getJobs = async (chart: ChartType) => {
    let { currentCluster, currentProject, setCurrentError } = this.context;

    api
      .getJobs(
        "<token>",
        {
          cluster_id: currentCluster.id,
        },
        {
          id: currentProject.id,
          chart: `${chart.chart.metadata.name}-${chart.chart.metadata.version}`,
          namespace: chart.namespace,
          release_name: chart.name,
        }
      )
      .then((res) => {
        // sort jobs by started timestamp
        this.sortJobsAndSave(res.data);
      })
      .catch((err) => setCurrentError(err));
  };

  sortJobsAndSave = (jobs: any[]) => {
    jobs.sort((job1, job2) => {
      let date1: Date = new Date(job1.status?.startTime);
      let date2: Date = new Date(job2.status?.startTime);

      return date2.getTime() - date1.getTime();
    });
    let newestImage = jobs[0]?.spec?.template?.spec?.containers[0]?.image;
    if (
      newestImage &&
      newestImage !== "porterdev/hello-porter-job" &&
      newestImage !== "porterdev/hello-porter-job:latest" &&
      newestImage !== "public.ecr.aws/o1j4x7p4/hello-porter-job" &&
      newestImage !== "public.ecr.aws/o1j4x7p4/hello-porter-job:latest"
    ) {
      this.setState({ jobs, newestImage, imageIsPlaceholder: false });
    } else {
      this.setState({ jobs });
    }
  };

  renderTabContents = (currentTab: string, submitValues?: any) => {
    let saveButton = (
      <SaveButton
        text="Rerun Job"
        onClick={() => this.handleSaveValues(submitValues, true)}
        status={this.state.saveValuesStatus}
        makeFlush={true}
      />
    );

    switch (currentTab) {
      case "jobs":
        if (this.state.imageIsPlaceholder) {
          return (
            <Placeholder>
              <TextWrap>
                <Header>
                  <Spinner src={loading} /> This job is currently being deployed
                </Header>
                Navigate to the "Actions" tab of your GitHub repo to view live
                build logs.
              </TextWrap>
            </Placeholder>
          );
        }
        return (
          <TabWrapper>
            <JobList
              jobs={this.state.jobs}
              setJobs={(jobs: any) => {
                this.setState({ jobs });
              }}
            />
            {saveButton}
          </TabWrapper>
        );
      case "settings":
        return (
          <SettingsSection
            showSource={true}
            currentChart={this.state.currentChart}
            refreshChart={() => this.refreshChart(0)}
            setShowDeleteOverlay={(x: boolean) =>
              this.setState({ showDeleteOverlay: x })
            }
            saveButtonText="Save Config"
          />
        );
      default:
    }
  };

  updateTabs() {
    let formData = this.state.currentChart.form;
    if (formData) {
      this.setState({
        formData,
      });
    }
    let tabOptions = [] as any[];

    // Append universal tabs
    tabOptions.push({ label: "Jobs", value: "jobs" });

    if (formData) {
      formData.tabs.map((tab: any, i: number) => {
        tabOptions.push({
          value: tab.name,
          label: tab.label,
          sections: tab.sections,
          context: tab.context,
        });
      });
    }

    tabOptions.push({ label: "Settings", value: "settings" });

    // Filter tabs if previewing an old revision
    this.setState({ tabOptions });
  }

  renderIcon = () => {
    let { currentChart } = this.state;

    if (
      currentChart.chart.metadata.icon &&
      currentChart.chart.metadata.icon !== ""
    ) {
      return <Icon src={currentChart.chart.metadata.icon} />;
    } else {
      return <i className="material-icons">tonality</i>;
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

  componentDidMount() {
    let { currentChart } = this.state;

    window.analytics.track("Opened Chart", {
      chart: currentChart.name,
    });

    this.getChartData(currentChart, currentChart.version);
    this.getJobs(currentChart);
    this.setupJobWebsocket(currentChart);
    this.setupCronJobWebsocket(currentChart);
  }

  handleUninstallChart = () => {
    let { currentProject, currentCluster } = this.context;
    let { currentChart } = this.state;
    this.setState({ deleting: true });
    api
      .uninstallTemplate(
        "<token>",
        {},
        {
          namespace: currentChart.namespace,
          storage: StorageType.Secret,
          name: currentChart.name,
          id: currentProject.id,
          cluster_id: currentCluster.id,
        }
      )
      .then((res) => {
        this.setState({ showDeleteOverlay: false });
        this.props.closeChart();
      })
      .catch(console.log);
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
    let { closeChart } = this.props;
    let { currentChart } = this.state;
    let chart = currentChart;

    return (
      <>
        <CloseOverlay onClick={closeChart} />
        <StyledExpandedChart>
          <ConfirmOverlay
            show={this.state.showDeleteOverlay}
            message={`Are you sure you want to delete ${currentChart.name}?`}
            onYes={this.handleUninstallChart}
            onNo={() => this.setState({ showDeleteOverlay: false })}
          />
          {this.renderDeleteOverlay()}

          <HeaderWrapper>
            <TitleSection>
              <Title>
                <IconWrapper>{this.renderIcon()}</IconWrapper>
                {chart.name}
              </Title>
              <InfoWrapper>
                <LastDeployed>
                  Run {this.state.jobs.length} times <Dot>•</Dot>Last template
                  update at
                  {" " + this.readableDate(chart.info.last_deployed)}
                </LastDeployed>
              </InfoWrapper>

              <TagWrapper>
                Namespace <NamespaceTag>{chart.namespace}</NamespaceTag>
              </TagWrapper>
            </TitleSection>

            <CloseButton onClick={closeChart}>
              <CloseButtonImg src={close} />
            </CloseButton>
          </HeaderWrapper>

          <BodyWrapper>
            <FormWrapper
              isReadOnly={this.state.imageIsPlaceholder}
              valuesToOverride={this.state.valuesToOverride}
              clearValuesToOverride={() =>
                this.setState({ valuesToOverride: {} })
              }
              formData={this.state.formData}
              tabOptions={this.state.tabOptions}
              isInModal={true}
              renderTabContents={this.renderTabContents}
              tabOptionsOnly={true}
              onSubmit={(formValues) =>
                this.handleSaveValues(formValues, false)
              }
              saveValuesStatus={this.state.saveValuesStatus}
              saveButtonText="Save Config"
            />
          </BodyWrapper>
        </StyledExpandedChart>
      </>
    );
  }
}

ExpandedJobChart.contextType = Context;

const TextWrap = styled.div``;

const Header = styled.div`
  font-weight: 500;
  color: #aaaabb;
  font-size: 16px;
  margin-bottom: 15px;
`;

const Placeholder = styled.div`
  height: 100%;
  padding: 30px;
  padding-bottom: 70px;
  font-size: 13px;
  color: #ffffff44;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Spinner = styled.img`
  width: 15px;
  height: 15px;
  margin-right: 12px;
  margin-bottom: -2px;
`;

const BodyWrapper = styled.div`
  width: 100%;
  height: 100%;
  overflow: hidden;
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
  border-radius: 10px;
  background: #26272f;
  box-shadow: 0 5px 12px 4px #00000033;
  animation: floatIn 0.3s;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
  padding: 25px;
  display: flex;
  overflow: hidden;
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
