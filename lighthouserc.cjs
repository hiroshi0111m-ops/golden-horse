module.exports = {
  ci: {
    collect: {
      url: ['http://127.0.0.1:8000/'],
      startServerCommand: 'python scripts/serve_golden_horse.py',
      startServerReadyPattern: 'PC:',
      numberOfRuns: 1,
      settings: {
        maxWaitForLoad: 15000,
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          disabled: false
        }
      }
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci'
    }
  }
};
