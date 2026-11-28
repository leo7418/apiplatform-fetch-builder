#!/usr/bin/env bash
# Rebuilds the database, serves the API installed in api/vendor on 127.0.0.1:8761, runs the tests and stops the server.
# Given an API Platform version (3.4, 4.4 or 5.0), installs it first from its lock file.
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -gt 0 ]; then
	cp "api/composer-$1.lock" api/composer.lock
	composer install --working-dir=api --no-interaction --no-progress
fi

export API_URL=http://127.0.0.1:8761/api
API_PLATFORM_VERSION=$(php -r 'require "api/vendor/autoload.php"; echo Composer\InstalledVersions::getVersion("api-platform/core");')
export API_PLATFORM_VERSION

php api/bin/console app:reset-database
php -S 127.0.0.1:8761 -t api/public >/dev/null 2>&1 &
trap "kill $!" EXIT
curl --silent --output /dev/null --retry 10 --retry-connrefused --retry-delay 1 "$API_URL"

node --experimental-strip-types --disable-warning=ExperimentalWarning --test 'tests/*.test.ts' 'prefixed/*.test.ts'
