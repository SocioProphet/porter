package repository

import (
	ints "github.com/porter-dev/porter/internal/models/integrations"
)

// KubeIntegrationRepository represents the set of queries on the OIDC auth
// mechanism
type KubeIntegrationRepository interface {
	CreateKubeIntegration(am *ints.KubeIntegration) (*ints.KubeIntegration, error)
	ReadKubeIntegration(id uint) (*ints.KubeIntegration, error)
	ListKubeIntegrationsByProjectID(projectID uint) ([]*ints.KubeIntegration, error)
}

// BasicIntegrationRepository represents the set of queries on the "basic" auth
// mechanism
type BasicIntegrationRepository interface {
	CreateBasicIntegration(am *ints.BasicIntegration) (*ints.BasicIntegration, error)
	ReadBasicIntegration(id uint) (*ints.BasicIntegration, error)
	ListBasicIntegrationsByProjectID(projectID uint) ([]*ints.BasicIntegration, error)
}

// OIDCIntegrationRepository represents the set of queries on the OIDC auth
// mechanism
type OIDCIntegrationRepository interface {
	CreateOIDCIntegration(am *ints.OIDCIntegration) (*ints.OIDCIntegration, error)
	ReadOIDCIntegration(id uint) (*ints.OIDCIntegration, error)
	ListOIDCIntegrationsByProjectID(projectID uint) ([]*ints.OIDCIntegration, error)
}

// OAuthIntegrationRepository represents the set of queries on the oauth
// mechanism
type OAuthIntegrationRepository interface {
	CreateOAuthIntegration(am *ints.OAuthIntegration) (*ints.OAuthIntegration, error)
	ReadOAuthIntegration(id uint) (*ints.OAuthIntegration, error)
	ListOAuthIntegrationsByProjectID(projectID uint) ([]*ints.OAuthIntegration, error)
	UpdateOAuthIntegration(am *ints.OAuthIntegration) (*ints.OAuthIntegration, error)
}

// AWSIntegrationRepository represents the set of queries on the AWS auth
// mechanism
type AWSIntegrationRepository interface {
	CreateAWSIntegration(am *ints.AWSIntegration) (*ints.AWSIntegration, error)
	OverwriteAWSIntegration(am *ints.AWSIntegration) (*ints.AWSIntegration, error)
	ReadAWSIntegration(id uint) (*ints.AWSIntegration, error)
	ListAWSIntegrationsByProjectID(projectID uint) ([]*ints.AWSIntegration, error)
}

// GCPIntegrationRepository represents the set of queries on the GCP auth
// mechanism
type GCPIntegrationRepository interface {
	CreateGCPIntegration(am *ints.GCPIntegration) (*ints.GCPIntegration, error)
	ReadGCPIntegration(id uint) (*ints.GCPIntegration, error)
	ListGCPIntegrationsByProjectID(projectID uint) ([]*ints.GCPIntegration, error)
}
