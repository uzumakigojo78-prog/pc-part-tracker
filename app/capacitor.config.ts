import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.uzumakigojo78_prog.pcparttracker',
  appName: 'PC Part Tracker',
  webDir: 'dist',
  plugins: {
    BackgroundRunner: {
      label: 'io.github.uzumakigojo78_prog.pcparttracker.prices',
      src: 'runners/runner.js',
      event: 'refreshPrices',
      repeat: true,
      interval: 360,
      autoStart: true,
    },
  },
}

export default config
