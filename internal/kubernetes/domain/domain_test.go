package domain_test

import (
	"testing"

	"github.com/porter-dev/porter/internal/kubernetes/domain"
	"github.com/stretchr/testify/assert"
)

func TestIsEndpointAllowed(t *testing.T) {
	res := domain.IsEndpointAllowed("10.10.10.10", "10.0.0.0/8")

	assert.False(t, res)

	res = domain.IsEndpointAllowed("10.10.10.10", "10.0.0.0/24")

	assert.True(t, res)

	// this should likely resolve on all host machines
	res = domain.IsEndpointAllowed("localhost", "127.0.0.0/24")

	assert.False(t, res)
}
