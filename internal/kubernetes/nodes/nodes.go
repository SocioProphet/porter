package nodes

import (
	"context"
	"sync"

	v1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type NodeUsage struct {
	cpuReqs                        string
	memoryReqs                     string
	ephemeralStorageReqs           string
	fractionCpuReqs                float64
	fractionCpuLimits              float64
	fractionMemoryReqs             float64
	fractionMemoryLimits           float64
	fractionEphemeralStorageReqs   float64
	fractionEphemeralStorageLimits float64
}

type NodeWithUsageData struct {
	Name                           string             `json:"name"`
	Labels                         map[string]string  `json:"labels"`
	CpuReqs                        string             `json:"cpu_reqs"`
	MemoryReqs                     string             `json:"memory_reqs"`
	EphemeralStorageReqs           string             `json:"ephemeral_storage_reqs"`
	FractionCpuReqs                float64            `json:"fraction_cpu_reqs"`
	FractionCpuLimits              float64            `json:"fraction_cpu_limits"`
	FractionMemoryReqs             float64            `json:"fraction_memory_reqs"`
	FractionMemoryLimits           float64            `json:"fraction_memory_limits"`
	FractionEphemeralStorageReqs   float64            `json:"fraction_ephemeral_storage_reqs"`
	FractionEphemeralStorageLimits float64            `json:"fraction_ephemeral_storage_limits"`
	Condition                      []v1.NodeCondition `json:"node_conditions"`
}

func (nu *NodeUsage) Externalize(node v1.Node) *NodeWithUsageData {
	return &NodeWithUsageData{
		Name:                           node.Name,
		Labels:                         node.Labels,
		CpuReqs:                        nu.cpuReqs,
		MemoryReqs:                     nu.memoryReqs,
		EphemeralStorageReqs:           nu.ephemeralStorageReqs,
		FractionCpuReqs:                nu.fractionCpuReqs,
		FractionCpuLimits:              nu.fractionCpuLimits,
		FractionMemoryReqs:             nu.fractionMemoryReqs,
		FractionMemoryLimits:           nu.fractionMemoryLimits,
		FractionEphemeralStorageReqs:   nu.fractionEphemeralStorageReqs,
		FractionEphemeralStorageLimits: nu.fractionEphemeralStorageLimits,
		Condition:                      node.Status.Conditions,
	}
}

func GetNodesUsage(clientset kubernetes.Interface) []*NodeWithUsageData {
	nodeList, _ := clientset.CoreV1().Nodes().List(context.TODO(), metav1.ListOptions{})

	extNodeList := make([]*NodeWithUsageData, len(nodeList.Items))
	var wg sync.WaitGroup
	for i := range nodeList.Items {
		index := i
		currentNode := &nodeList.Items[index]
		wg.Add(1)
		go func() {
			defer wg.Done()
			podList := getPodsForNode(clientset, currentNode.Name)
			nodeUsage := DescribeNodeResource(podList, currentNode)

			extNodeList[index] = nodeUsage.Externalize(*currentNode)
		}()
	}
	wg.Wait()

	return extNodeList
}

func getPodsForNode(clientset kubernetes.Interface, nodeName string) *v1.PodList {
	podList, _ := clientset.CoreV1().Pods("").List(context.TODO(), metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + nodeName + ",status.phase=Running",
	})

	return podList
}

type NodeDetails struct {
	NodeWithUsageData
	AllocatableCpu    int64  `json:"allocatable_cpu"`
	AllocatableMemory string `json:"allocatable_memory"`
}

func DescribeNode(clientset kubernetes.Interface, nodeName string) *NodeDetails {
	node, _ := clientset.CoreV1().Nodes().Get(context.TODO(), nodeName, metav1.GetOptions{})

	podList := getPodsForNode(clientset, node.Name)
	nodeUsage := DescribeNodeResource(podList, node)
	extNodeUsage := nodeUsage.Externalize(*node)

	return &NodeDetails{
		NodeWithUsageData: *extNodeUsage,
		AllocatableCpu:    node.Status.Allocatable.Cpu().MilliValue(),
		AllocatableMemory: node.Status.Allocatable.Memory().String(),
	}
}
