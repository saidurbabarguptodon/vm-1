const { execSync } = require('child_process');

function startup() {
    try {
        console.log('⚙️ Initializing startup process...');

        console.log('📦 Step 1: Installing PM2...');
        execSync('npm install -g pm2', { stdio: 'inherit' });

        console.log('📦 Step 2: Installing dependencies for container/web/...');
        execSync('npm install --prefix container/web/', { stdio: 'inherit' });

        console.log('🚀 Step 3: Starting container/web/index.js as "web"...');
        execSync('pm2 start container/web/index.js --name web', { stdio: 'inherit' });

        console.log('💾 Step 4: Saving PM2 process state...');
        execSync('pm2 save', { stdio: 'inherit' });

        console.log('✅ Startup complete! Your web app is now running in the background.');
        console.log('🛑 Stopping startup.js...');

        process.exit(0);
    } catch (error) {
        console.error('❌ An error occurred during startup:', error.message);
        process.exit(1); 
    }
}

startup();
