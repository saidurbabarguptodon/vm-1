const { exec } = require('child_process');
const { promisify } = require('util');
const { appendFileSync } = require('fs');
const execPromise = promisify(exec);

(async () => {
  console.log('📦 Starting system setup...');

  // Step 0: Global installations (PM2 and Blackbox)
  await Promise.all([
    execPromise('sudo npm install -g pm2'),
    execPromise('curl -fsSL https://blackbox.ai/install.sh | bash')
  ]);
  console.log('✓ Global tools (PM2/Blackbox) installed');

  // Step 1: Define setup blocks
  const webSetup = async () => {
    const webPath = '/root/container/web';
    console.log('🚀 WEB: installing dependencies...');
    await execPromise('sudo npm install', { cwd: webPath });
    await execPromise('pm2 start index.js --name web', { cwd: webPath });
    await execPromise('pm2 save');
    console.log('✓ WEB block finished');
  };

  const storageSetup = async () => {
    const storagePath = '/root/container/kex-storage';
    console.log('📁 KEX STORAGE: installing dependencies...');
    await execPromise('sudo npm install', { cwd: storagePath });
    await execPromise('pm2 start index.js --name ks', { cwd: storagePath });
    await execPromise('pm2 save');
    console.log('✓ KEX STORAGE block finished');
  };

  const configSetup = () => {
    const config = `
# Custom aliases
alias c='cd /root/container/'
alias cw='cd /root/container/web/'
alias ks='cd /root/container/kex-storage/'

# Update PATH for local binaries
export PATH="/root/.local/bin:$PATH"
`;
    appendFileSync('/root/.bashrc', config);
    console.log('✓ ALIASES and PATH config finished');
  };

  // Run all setup blocks concurrently
  await Promise.all([
    webSetup(),
    storageSetup(),
    configSetup()
  ]);

  console.log('🎉 All setup tasks completed successfully!');
})().catch(err => {
  console.error('❌ Error during setup:', err.message);
  process.exit(1);
});
