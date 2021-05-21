package models

import "helm.sh/helm/v3/pkg/chart"

// PorterChartList is how a chart gets displayed when listed
type PorterChartList struct {
	Name        string   `json:"name"`
	Versions    []string `json:"versions"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
}

// PorterChartRead is a chart with detailed information and a form for reading
type PorterChartRead struct {
	Markdown string                 `json:"markdown"`
	Metadata *chart.Metadata        `json:"metadata"`
	Values   map[string]interface{} `json:"values"`
	Form     *FormYAML              `json:"form"`
}

// FormContext is the target context
type FormContext struct {
	Type   string            `yaml:"type" json:"type"`
	Config map[string]string `yaml:"config" json:"config"`
}

// FormTab is a tab rendered in a form
type FormTab struct {
	Context  *FormContext   `yaml:"context" json:"context"`
	Name     string         `yaml:"name" json:"name"`
	Label    string         `yaml:"label" json:"label"`
	Sections []*FormSection `yaml:"sections" json:"sections,omitempty"`
}

// FormSection is a section of a form
type FormSection struct {
	Context  *FormContext   `yaml:"context" json:"context"`
	Name     string         `yaml:"name" json:"name"`
	ShowIf   string         `yaml:"show_if" json:"show_if"`
	Contents []*FormContent `yaml:"contents" json:"contents,omitempty"`
}

// FormContent is a form's atomic unit
type FormContent struct {
	Context     *FormContext `yaml:"context" json:"context"`
	Type        string       `yaml:"type" json:"type"`
	Label       string       `yaml:"label" json:"label"`
	Required    bool         `json:"required"`
	Name        string       `yaml:"name,omitempty" json:"name,omitempty"`
	Variable    string       `yaml:"variable,omitempty" json:"variable,omitempty"`
	Placeholder string       `yaml:"placeholder,omitempty" json:"placeholder,omitempty"`
	Value       interface{}  `yaml:"value,omitempty" json:"value,omitempty"`
	Settings    struct {
		Default            interface{} `yaml:"default,omitempty" json:"default,omitempty"`
		Unit               interface{} `yaml:"unit,omitempty" json:"unit,omitempty"`
		OmitUnitFromValue  bool        `yaml:"omitUnitFromValue,omitempty" json:"omitUnitFromValue,omitempty"`
		DisableAfterLaunch bool        `yaml:"disableAfterLaunch,omitempty" json:"disableAfterLaunch,omitempty"`
		Options            interface{} `yaml:"options,omitempty" json:"options,omitempty"`
		Placeholder        string      `yaml:"placeholder,omitempty" json:"placeholder,omitempty"`
	} `yaml:"settings,omitempty" json:"settings,omitempty"`
}

// FormYAML represents a chart's values.yaml form abstraction
type FormYAML struct {
	Name        string     `yaml:"name" json:"name"`
	Icon        string     `yaml:"icon" json:"icon"`
	HasSource   string     `yaml:"hasSource" json:"hasSource"`
	Description string     `yaml:"description" json:"description"`
	Tags        []string   `yaml:"tags" json:"tags"`
	Tabs        []*FormTab `yaml:"tabs" json:"tabs,omitempty"`
}
