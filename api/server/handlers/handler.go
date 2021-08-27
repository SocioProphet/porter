package handlers

import (
	"net/http"

	"github.com/porter-dev/porter/api/server/shared"
	"github.com/porter-dev/porter/api/server/shared/apierrors"
	"github.com/porter-dev/porter/api/server/shared/config"
	"github.com/porter-dev/porter/internal/repository"
)

type PorterHandler interface {
	Config() *config.Config
	Repo() repository.Repository
	HandleAPIError(w http.ResponseWriter, r *http.Request, err apierrors.RequestError)
}

type PorterHandlerWriter interface {
	PorterHandler
	shared.ResultWriter
}

type PorterHandlerReader interface {
	PorterHandler
	shared.RequestDecoderValidator
}

type PorterHandlerReadWriter interface {
	PorterHandlerWriter
	PorterHandlerReader
}

type DefaultPorterHandler struct {
	config           *config.Config
	decoderValidator shared.RequestDecoderValidator
	writer           shared.ResultWriter
}

func NewDefaultPorterHandler(
	config *config.Config,
	decoderValidator shared.RequestDecoderValidator,
	writer shared.ResultWriter,
) PorterHandlerReadWriter {
	return &DefaultPorterHandler{config, decoderValidator, writer}
}

func (d *DefaultPorterHandler) Config() *config.Config {
	return d.config
}

func (d *DefaultPorterHandler) Repo() repository.Repository {
	return d.config.Repo
}

func (d *DefaultPorterHandler) HandleAPIError(w http.ResponseWriter, r *http.Request, err apierrors.RequestError) {
	apierrors.HandleAPIError(d.Config(), w, r, err)
}

func (d *DefaultPorterHandler) WriteResult(w http.ResponseWriter, r *http.Request, v interface{}) {
	d.writer.WriteResult(w, r, v)
}

func (d *DefaultPorterHandler) DecodeAndValidate(w http.ResponseWriter, r *http.Request, v interface{}) bool {
	return d.decoderValidator.DecodeAndValidate(w, r, v)
}

func (d *DefaultPorterHandler) DecodeAndValidateNoWrite(r *http.Request, v interface{}) error {
	return d.decoderValidator.DecodeAndValidateNoWrite(r, v)
}

func IgnoreAPIError(w http.ResponseWriter, r *http.Request, err apierrors.RequestError) {
	return
}
