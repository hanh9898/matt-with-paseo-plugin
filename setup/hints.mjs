/** What setup prints for a missing prerequisite, per platform: a command to run or a page to read. */
const HINTS = {
  node: { all: "install Node 22.18 or later from https://nodejs.org" },
  git: {
    win32: "winget install --id Git.Git",
    darwin: "xcode-select --install",
    all: "install git from https://git-scm.com/downloads",
  },
  ghLogin: { all: "gh auth login" },
  gh: {
    win32: "winget install --id GitHub.cli",
    darwin: "brew install gh",
    all: "install gh from https://cli.github.com",
  },
  ghSkill: {
    win32: "update gh, which needs gh skill (2.90 or later): winget upgrade --id GitHub.cli",
    darwin: "update gh, which needs gh skill (2.90 or later): brew upgrade gh",
    all: "update gh, which needs gh skill (2.90 or later): https://cli.github.com",
  },
  claude: { all: "install Claude Code from https://claude.com/claude-code" },
  paseo: { all: "install the Paseo CLI from https://paseo.sh" },
  daemon: { all: "paseo daemon start" },
  mattpocock: { all: "claude plugin install mattpocock-skills (run by you, not by setup)" },
};

/** The hint for `item` on `platform`. */
export function hint(item, platform) {
  const hints = HINTS[item];
  return hints[platform] ?? hints.all;
}
