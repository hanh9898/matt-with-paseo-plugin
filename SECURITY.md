# Security policy

## Supported versions

The plugin is pre-release. Only the latest commit on `main` receives fixes.

## Reporting a vulnerability

Do not open a public issue. Report it privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability** ([direct link](https://github.com/hanh9898/matt-with-paseo-plugin/security/advisories/new)).

If that option is not available, open an issue titled "Security contact request" with no details of the vulnerability, and the maintainer will arrange a private channel.

Include the plugin version, the Paseo version, what an attacker can do, and the steps to reproduce. Never include a token or a credential.

## What to expect

The maintainer acknowledges a report within seven days, and says what happens next. A fix ships with a note in [`CHANGELOG.md`](CHANGELOG.md), crediting the reporter unless they prefer not to be named.

## Scope

The plugin runs trusted, local code inside Paseo and can answer permission requests for the user. Anything that lets it act outside the delegation the user set, read or leak a credential, or touch an agent it did not mark is in scope.
