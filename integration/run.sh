#!/usr/bin/env bash
# Rebuilds the database, serves the API installed in api/vendor on 127.0.0.1:8761, runs the tests and stops the server.
set -euo pipefail
cd "$(dirname "$0")"

export API_URL=http://127.0.0.1:8761/api
API_PLATFORM_VERSION=$(php -r 'require "api/vendor/autoload.php"; echo Composer\InstalledVersions::getVersion("api-platform/core");')
export API_PLATFORM_VERSION

php api/bin/console app:reset-database
php -S 127.0.0.1:8761 -t api/public >/dev/null 2>&1 &
trap "kill $!" EXIT
curl --silent --output /dev/null --retry 10 --retry-connrefused --retry-delay 1 "$API_URL"

node --experimental-strip-types --disable-warning=ExperimentalWarning --test 'tests/*.test.ts'
