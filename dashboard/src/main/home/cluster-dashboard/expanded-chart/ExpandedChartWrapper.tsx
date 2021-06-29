import React, { Component } from "react";
import styled from "styled-components";
import { Context } from "shared/Context";
import { RouteComponentProps, withRouter } from "react-router";

import {
  ResourceType,
  ChartType,
  StorageType,
  ClusterType,
} from "shared/types";
import api from "shared/api";
import { PorterUrl, pushQueryParams, pushFiltered } from "shared/routing";
import ExpandedJobChart from "./ExpandedJobChart";
import ExpandedChart from "./ExpandedChart";
import Loading from "components/Loading";
import PageNotFound from "components/PageNotFound";

type PropsType = RouteComponentProps & {
  setSidebar: (x: boolean) => void;
  isMetricsInstalled: boolean;
};

type StateType = {
  loading: boolean;
  currentChart: ChartType;
};

class ExpandedChartWrapper extends Component<PropsType, StateType> {
  state = {
    loading: true,
    currentChart: null as ChartType,
  };

  // Retrieve full chart data (includes form and values)
  getChartData = () => {
    let { match } = this.props;
    let { namespace, chartName } = match.params as any;
    let { currentProject, currentCluster } = this.context;
    if (currentProject && currentCluster) {
      // TODO: add query for retrieving max revision #
      api
        .getRevisions(
          "<token>",
          {
            namespace: namespace,
            cluster_id: currentCluster.id,
            storage: StorageType.Secret,
          },
          { id: currentProject.id, name: chartName }
        )
        .then((res) => {
          res.data.sort((a: ChartType, b: ChartType) => {
            return -(a.version - b.version);
          });
          let maxVersion = res.data[0].version;
          api
            .getChart(
              "<token>",
              {
                namespace: namespace,
                cluster_id: currentCluster.id,
                storage: StorageType.Secret,
              },
              {
                name: chartName,
                revision: maxVersion,
                id: currentProject.id,
              }
            )
            .then((res) => {
              this.setState({ currentChart: res.data, loading: false });
            })
            .catch((err) => {
              console.log("err", err.response.data);
              this.setState({ loading: false });
            });
        })
        .catch((err) => {
          console.log("err", err.response.data);
          this.setState({ loading: false });
        });
    }
  };

  componentDidMount() {
    this.setState({ loading: true });
    this.getChartData();
  }

  render() {
    let { setSidebar, location, match } = this.props;
    let { baseRoute, namespace } = match.params as any;
    let { loading, currentChart } = this.state;
    if (loading) {
      return <Loading />;
    } else if (currentChart && baseRoute === "jobs") {
      return (
        <ExpandedJobChart
          namespace={namespace}
          currentChart={currentChart}
          currentCluster={this.context.currentCluster}
          closeChart={() =>
            pushFiltered(this.props, "/jobs", ["project_id"], {
              cluster: this.context.currentCluster.name,
              namespace: namespace,
            })
          }
          setSidebar={setSidebar}
        />
      );
    } else if (currentChart && baseRoute === "applications") {
      return (
        <ExpandedChart
          namespace={namespace}
          isMetricsInstalled={this.props.isMetricsInstalled}
          currentChart={currentChart}
          currentCluster={this.context.currentCluster}
          closeChart={() =>
            pushFiltered(this.props, "/applications", ["project_id"], {
              cluster: this.context.currentCluster.name,
              namespace: namespace,
            })
          }
          setSidebar={setSidebar}
        />
      );
    }
    return <PageNotFound />;
  }
}

ExpandedChartWrapper.contextType = Context;

export default withRouter(ExpandedChartWrapper);

const NotFoundPlaceholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;
