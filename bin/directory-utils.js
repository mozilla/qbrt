const path = require('path');
function getPlatformDirectories(platform=process.platform) {
  const distDir = path.join(__dirname, '..', 'dist', platform);
  const installDir = path.join(distDir, platform === 'darwin' ? 'Runtime.app' : 'runtime');
  const resourcesDir = platform === 'darwin' ? path.join(installDir, 'Contents', 'Resources') : installDir;
  const executableDir = process.platform === 'darwin' ? path.join(installDir, 'Contents', 'MacOS') : installDir;
  return { distDir, installDir, resourcesDir, executableDir };
}
module.exports = { getPlatformDirectories };
