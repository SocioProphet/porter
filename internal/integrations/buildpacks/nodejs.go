package buildpacks

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/Masterminds/semver/v3"
	"github.com/google/go-github/v41/github"
)

var (
	lts = map[string]int{
		"argon":   4,
		"boron":   6,
		"carbon":  8,
		"dubnium": 10,
	}
)

type nodejsRuntime struct {
	wg sync.WaitGroup
}

func NewNodeRuntime() Runtime {
	return &nodejsRuntime{}
}

func (runtime *nodejsRuntime) detectYarn(results chan struct {
	string
	bool
}, directoryContent []*github.RepositoryContent) {
	yarnLockFound := false
	packageJSONFound := false
	for i := 0; i < len(directoryContent); i++ {
		name := directoryContent[i].GetName()
		if name == "yarn.lock" {
			yarnLockFound = true
		} else if name == "package.json" {
			packageJSONFound = true
		}
		if yarnLockFound && packageJSONFound {
			break
		}
	}
	if yarnLockFound && packageJSONFound {
		results <- struct {
			string
			bool
		}{yarn, true}
	}
	runtime.wg.Done()
}

func (runtime *nodejsRuntime) detectNPM(results chan struct {
	string
	bool
}, directoryContent []*github.RepositoryContent) {
	packageJSONFound := false
	for i := 0; i < len(directoryContent); i++ {
		name := directoryContent[i].GetName()
		if name == "package.json" {
			packageJSONFound = true
			break
		}
	}
	if packageJSONFound {
		results <- struct {
			string
			bool
		}{npm, true}
	}
	runtime.wg.Done()
}

func (runtime *nodejsRuntime) detectStandalone(results chan struct {
	string
	bool
}, directoryContent []*github.RepositoryContent) {
	jsFileFound := false
	for i := 0; i < len(directoryContent); i++ {
		name := directoryContent[i].GetName()
		if name == "server.js" || name == "app.js" || name == "main.js" || name == "index.js" {
			jsFileFound = true
			break
		}
	}
	if jsFileFound {
		results <- struct {
			string
			bool
		}{standalone, true}
	}
	runtime.wg.Done()
}

// copied directly from https://github.com/paketo-buildpacks/node-engine/blob/main/nvmrc_parser.go
func validateNvmrc(content string) (string, error) {
	content = strings.TrimSpace(strings.ToLower(content))

	if content == "lts/*" || content == "node" {
		return content, nil
	}

	for key := range lts {
		if content == strings.ToLower("lts/"+key) {
			return content, nil
		}
	}

	content = strings.TrimPrefix(content, "v")

	if _, err := semver.NewConstraint(content); err != nil {
		return "", fmt.Errorf("invalid version constraint specified in .nvmrc: %q", content)
	}

	return content, nil
}

// copied directly from https://github.com/paketo-buildpacks/node-engine/blob/main/nvmrc_parser.go
func formatNvmrcContent(version string) string {
	if version == "node" {
		return "*"
	}

	if strings.HasPrefix(version, "lts") {
		ltsName := strings.SplitN(version, "/", 2)[1]
		if ltsName == "*" {
			var maxVersion int
			for _, versionValue := range lts {
				if maxVersion < versionValue {
					maxVersion = versionValue
				}
			}

			return fmt.Sprintf("%d.*", maxVersion)
		}

		return fmt.Sprintf("%d.*", lts[ltsName])
	}

	return version
}

// copied directly from https://github.com/paketo-buildpacks/node-engine/blob/main/node_version_parser.go
func validateNodeVersion(content string) (string, error) {
	content = strings.TrimSpace(strings.ToLower(content))

	content = strings.TrimPrefix(content, "v")

	if _, err := semver.NewConstraint(content); err != nil {
		return "", fmt.Errorf("invalid version constraint specified in .node-version: %q", content)
	}

	return content, nil
}

func (runtime *nodejsRuntime) Detect(
	client *github.Client,
	directoryContent []*github.RepositoryContent,
	owner, name, path string,
	repoContentOptions github.RepositoryContentGetOptions,
	paketo, heroku *BuilderInfo,
) error {
	results := make(chan struct {
		string
		bool
	}, 3)

	runtime.wg.Add(3)
	go runtime.detectYarn(results, directoryContent)
	go runtime.detectNPM(results, directoryContent)
	go runtime.detectStandalone(results, directoryContent)
	runtime.wg.Wait()
	close(results)

	paketoBuildpackInfo := BuildpackInfo{
		Name:      "NodeJS",
		Buildpack: "gcr.io/paketo-buildpacks/nodejs",
	}
	herokuBuildpackInfo := BuildpackInfo{
		Name:      "NodeJS",
		Buildpack: "heroku/nodejs",
	}

	if len(results) == 0 {
		paketo.Others = append(paketo.Others, paketoBuildpackInfo)
		heroku.Others = append(heroku.Others, herokuBuildpackInfo)
		return nil
	}

	foundYarn := false
	foundNPM := false
	foundStandalone := false
	for result := range results {
		if result.string == yarn {
			foundYarn = true
		} else if result.string == npm {
			foundNPM = true
		} else if result.string == standalone {
			foundStandalone = true
		}
	}

	if foundYarn || foundNPM {
		// it is safe to assume that the project contains a package.json
		fileContent, _, _, err := client.Repositories.GetContents(
			context.Background(),
			owner,
			name,
			fmt.Sprintf("%s/package.json", path),
			&repoContentOptions,
		)
		if err != nil {
			paketo.Others = append(paketo.Others, paketoBuildpackInfo)
			heroku.Others = append(heroku.Others, herokuBuildpackInfo)
			return fmt.Errorf("error fetching contents of package.json: %v", err)
		}
		var packageJSON struct {
			Scripts map[string]string `json:"scripts"`
			Engines struct {
				Node string `json:"node"`
			} `json:"engines"`
		}

		data, err := fileContent.GetContent()
		if err != nil {
			paketo.Others = append(paketo.Others, paketoBuildpackInfo)
			heroku.Others = append(heroku.Others, herokuBuildpackInfo)
			return fmt.Errorf("error calling GetContent() on package.json: %v", err)
		}
		err = json.NewDecoder(strings.NewReader(data)).Decode(&packageJSON)
		if err != nil {
			paketo.Others = append(paketo.Others, paketoBuildpackInfo)
			heroku.Others = append(heroku.Others, herokuBuildpackInfo)
			return fmt.Errorf("error decoding package.json contents to struct: %v", err)
		}

		if packageJSON.Engines.Node == "" {
			// we should now check for the node engine version in .nvmrc and then .node-version
			nvmrcFound := false
			nodeVersionFound := false
			for i := 0; i < len(directoryContent); i++ {
				name := directoryContent[i].GetName()
				if name == ".nvmrc" {
					nvmrcFound = true
				} else if name == ".node-version" {
					nodeVersionFound = true
				}
			}

			if nvmrcFound {
				// copy exact behavior of https://github.com/paketo-buildpacks/node-engine/blob/main/nvmrc_parser.go
				fileContent, _, _, err = client.Repositories.GetContents(
					context.Background(),
					owner,
					name,
					fmt.Sprintf("%s/.nvmrc", path),
					&repoContentOptions,
				)
				if err != nil {
					paketo.Others = append(paketo.Others, paketoBuildpackInfo)
					heroku.Others = append(heroku.Others, herokuBuildpackInfo)
					return fmt.Errorf("error fetching contents of .nvmrc: %v", err)
				}
				data, err = fileContent.GetContent()
				if err != nil {
					paketo.Others = append(paketo.Others, paketoBuildpackInfo)
					heroku.Others = append(heroku.Others, herokuBuildpackInfo)
					return fmt.Errorf("error calling GetContent() on .nvmrc: %v", err)
				}
				nvmrcVersion, err := validateNvmrc(data)
				if err != nil {
					paketo.Others = append(paketo.Others, paketoBuildpackInfo)
					heroku.Others = append(heroku.Others, herokuBuildpackInfo)
					return fmt.Errorf("error validating .nvmrc: %v", err)
				}
				nvmrcVersion = formatNvmrcContent(nvmrcVersion)

				if nvmrcVersion != "*" {
					packageJSON.Engines.Node = data
				}
			}

			if packageJSON.Engines.Node == "" && nodeVersionFound {
				// copy exact behavior of https://github.com/paketo-buildpacks/node-engine/blob/main/node_version_parser.go
				fileContent, _, _, err = client.Repositories.GetContents(
					context.Background(),
					owner,
					name,
					fmt.Sprintf("%s/.node-version", path),
					&repoContentOptions,
				)
				if err != nil {
					paketo.Others = append(paketo.Others, paketoBuildpackInfo)
					heroku.Others = append(heroku.Others, herokuBuildpackInfo)
					return fmt.Errorf("error fetching contents of .node-version: %v", err)
				}
				data, err = fileContent.GetContent()
				if err != nil {
					paketo.Others = append(paketo.Others, paketoBuildpackInfo)
					heroku.Others = append(heroku.Others, herokuBuildpackInfo)
					return fmt.Errorf("error calling GetContent() on .node-version: %v", err)
				}
				nodeVersion, err := validateNodeVersion(data)
				if err != nil {
					paketo.Others = append(paketo.Others, paketoBuildpackInfo)
					heroku.Others = append(heroku.Others, herokuBuildpackInfo)
					return fmt.Errorf("error validating .node-version: %v", err)
				}
				if nodeVersion != "" {
					packageJSON.Engines.Node = nodeVersion
				}
			}
		}

		if packageJSON.Engines.Node == "" {
			// use the default node engine version from https://github.com/paketo-buildpacks/node-engine/blob/main/buildpack.toml
			packageJSON.Engines.Node = "16.*.*"
		}

		paketoBuildpackInfo.Config = make(map[string]interface{})
		paketoBuildpackInfo.Config["scripts"] = packageJSON.Scripts
		paketoBuildpackInfo.Config["node_engine"] = packageJSON.Engines.Node
		paketo.Detected = append(paketo.Detected, paketoBuildpackInfo)

		herokuBuildpackInfo.Config = make(map[string]interface{})
		herokuBuildpackInfo.Config["scripts"] = packageJSON.Scripts
		herokuBuildpackInfo.Config["node_engine"] = packageJSON.Engines.Node
		heroku.Detected = append(heroku.Detected, herokuBuildpackInfo)
	} else if foundStandalone {
		paketo.Detected = append(paketo.Detected, paketoBuildpackInfo)
		heroku.Detected = append(heroku.Detected, herokuBuildpackInfo)
	}

	return nil
}
