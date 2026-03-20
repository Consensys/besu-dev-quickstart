# Besu Dev Quickstart

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Usage](#usage)

## Prerequisites

To run these tutorials, you must have the following installed:

- [Docker and Docker-compose](https://docs.docker.com/compose/install/) v2 or higher

| ⚠️ **Note**: If on MacOS or Windows, please ensure that you allow docker to use upto 4G of memory or 6G if running Privacy examples under the _Resources_ section. The [Docker for Mac](https://docs.docker.com/docker-for-mac/) and [Docker Desktop](https://docs.docker.com/docker-for-windows/) sites have details on how to do this at the "Resources" heading       |
| ---                                                                                                                                                                                                                                                                                                                                                                           |


| ⚠️ **Note**: This has only been tested on Windows 11 25H2, WSL2 and Docker                                                                                                                                                  |
| ---                                                                                                                                                                                                                                                                                                                                                                                |

- On Windows, please use WSL2 kernels 6.6x or higher
- You can use either Docker Desktop or docker-engine (with the compose plugin) within the WSL2 environment
- [Nodejs](https://nodejs.org/en/download/) or [Yarn](https://yarnpkg.com/cli/node)


## Usage 

Create the docker compose file and artifacts with 

```
$> npx besu-dev-quickstart
         ____                                         
        / __ )___  _______  __                        
       / __  / _ \/ ___/ / / /                        
      / /_/ /  __(__  ) /_/ /                         
     /_____/\___/____/\__,_/  __                      
        / __ \___ _   _____  / /___  ____  ___  _____ 
       / / / / _ \ | / / _ \/ / __ \/ __ \/ _ \/ ___/ 
      / /_/ /  __/ |/ /  __/ / /_/ / /_/ /  __/ /     
     /_____/\___/|___/\___/_/\____/ .___/\___/_/      
       ____        _      __     /_/__             __ 
      / __ \__  __(_)____/ /_______/ /_____ ______/ /_
     / / / / / / / / ___/ //_/ ___/ __/ __ / ___/ __/
    / /_/ / /_/ / / /__/ ,< (__  ) /_/ /_/ / /  / /_  
    \___\_\__,_/_/\___/_/|_/____/\__/\__,_/_/   \__/         


Welcome to the Besu Developer Quickstart utility. This tool can be used
to rapidly generate a local public node or private network for development purposes.

To get started, be sure that you have both Docker and Docker Compose
installed, then answer the following questions.

What type of network would you like the client to run? Default: [1]
    1. Private
    2. Public

Add Otel Collector spans to Grafana? Default: [N/y]
 
Do you wish to enable the Chainlens explorer? [N/y]
 
Where should we create the config files for this network? Please
choose either an empty directory, or a path to a new directory that does
not yet exist. Default: ./besu-test-network

Once completed, change directory to the artifacts folder: 

```
$> cd besu-test-network
``` 


Alternatively, you can use cli options and skip the prompt above like so:

```
npx besu-dev-quickstart --networkType private --outputPath ./besu-test-network --otel false --chainlens false
```

**To start services and the network:**

Follow the README.md file of select artifact

## Troubleshooting

### Besu only - `java.io.IOException: Permission denied` for volumes

The `besu` containers use user `besu` mapped to user:group 1000. On your local machine, if your userid is not 1000, you will see this error. To fix this either run as user 1000 or map
the container's user 1000 to your local user id so permissions will work like so in the compose file

```
image: some:img
user: $(id -u):$(id -g)
```
