const updateUrl = process.env.CENTRALHUB_UPDATE_URL;
const githubRepository = process.env.GITHUB_REPOSITORY;

function getPublishConfig() {
  if (updateUrl) {
    return [
      {
        provider: "generic",
        url: updateUrl,
      },
    ];
  }

  if (githubRepository) {
    const [owner, repo] = githubRepository.split("/");
    if (owner && repo) {
      return [
        {
          provider: "github",
          owner,
          repo,
          releaseType: "release",
        },
      ];
    }
  }

  return null;
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.centralhub.app",
  productName: "Central Hub",
  artifactName: "CentralHub-Setup.${ext}",
  directories: {
    output: "release",
  },
  files: [
    "main.js",
    "main/**/*",
    "out/**/*",
    "build/**/*",
    "package.json",
    "THIRD_PARTY_NOTICES.md",
    "node_modules/**/*",
  ],
  asarUnpack: [
    "node_modules/node-pty/**/*",
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    icon: "build/icon.ico",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Central Hub",
  },
  mac: {
    target: ["dmg"],
    icon: "build/icon.png",
  },
  linux: {
    target: ["AppImage"],
    icon: "build/icon.png",
    category: "Utility",
  },
  publish: getPublishConfig(),
};
