package authz

import (
	"context"
	"fmt"
	"net/http"

	"github.com/porter-dev/porter/api/server/shared/apierrors"
	"github.com/porter-dev/porter/api/server/shared/config"
	"github.com/porter-dev/porter/api/types"
	"github.com/porter-dev/porter/internal/models"
	"github.com/porter-dev/porter/internal/models/integrations"
	"gorm.io/gorm"
)

type GitInstallationScopedFactory struct {
	config *config.Config
}

func NewGitInstallationScopedFactory(
	config *config.Config,
) *GitInstallationScopedFactory {
	return &GitInstallationScopedFactory{config}
}

func (p *GitInstallationScopedFactory) Middleware(next http.Handler) http.Handler {
	return &GitInstallationScopedMiddleware{next, p.config}
}

type GitInstallationScopedMiddleware struct {
	next   http.Handler
	config *config.Config
}

func (p *GitInstallationScopedMiddleware) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// read the project to check scopes
	proj, _ := r.Context().Value(types.ProjectScope).(*models.Project)

	// get the registry id from the URL param context
	reqScopes, _ := r.Context().Value(types.RequestScopeCtxKey).(map[types.PermissionScope]*types.RequestAction)
	gitInstallationID := reqScopes[types.GitInstallationScope].Resource.UInt

	gitInstallation, err := p.config.Repo.GithubAppInstallation().ReadGithubAppInstallation(proj.ID, gitInstallationID)

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			apierrors.HandleAPIError(p.config, w, r, apierrors.NewErrForbidden(
				fmt.Errorf("github app installation with id %d not found in project %d", gitInstallationID, proj.ID),
			))
		} else {
			apierrors.HandleAPIError(p.config, w, r, apierrors.NewErrInternal(err))
		}

		return
	}

	ctx := NewGitInstallationContext(r.Context(), gitInstallation)
	r = r.WithContext(ctx)
	p.next.ServeHTTP(w, r)
}

func NewGitInstallationContext(ctx context.Context, ga *integrations.GithubAppInstallation) context.Context {
	return context.WithValue(ctx, types.GitInstallationScope, ga)
}
