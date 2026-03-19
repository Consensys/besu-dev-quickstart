#!/bin/bash -eu

# Copyright 2026 ConsenSys AG.
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
# an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
# specific language governing permissions and limitations under the License.

NO_LOCK_REQUIRED=false

. ./.env
. ./.common.sh
dots=""
maxRetryCount=50
HOST=${DOCKER_PORT_2375_TCP_ADDR:-"localhost"}

# Displays links to exposed services
echo "${bold}*************************************"
echo "Besu Dev Quickstart "
echo "*************************************${normal}"
echo "----------------------------------"
echo "List endpoints and services"
echo "----------------------------------"

echo "JSON-RPC HTTP service endpoint        : http://${HOST}:8545"
echo "JSON-RPC WebSocket service endpoint   : ws://${HOST}:8546"
echo "Prometheus address                    : http://${HOST}:9090/graph"
echo "Grafana metrics                       : http://${HOST}:3000/d/XE4V0WGZz/besu-overview?orgId=1&refresh=10s&from=now-30m&to=now&var-system=All"
echo "Grafana logs                          : http://${HOST}:3000/a/grafana-lokiexplore-app/explore?patterns=%5B%5D&from=now-15m&to=now&timezone=browser&var-lineFormat=&var-ds=P8E80F9AEF21F6940&var-filters=&var-fields=&var-levels=&var-metadata=&var-jsonFields=&var-all-fields=&var-patterns=&var-lineFilterV2=&var-lineFilters=&var-primary_label=service_name%7C%3D~%7C.%2B"
echo ""
echo "For more information on the endpoints and services, refer to README.md in the installation directory."
echo "****************************************************************"
