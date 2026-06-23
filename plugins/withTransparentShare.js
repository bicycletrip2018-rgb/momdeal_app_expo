const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

// Step 1: Inject Theme.TransparentShare into res/values/styles.xml
function withTranslucentStyles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const stylesPath = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/values/styles.xml'
      );

      if (!fs.existsSync(stylesPath)) return config;

      let xml = fs.readFileSync(stylesPath, 'utf8');
      if (xml.includes('Theme.TransparentShare')) return config;

      const theme = [
        '    <style name="Theme.TransparentShare" parent="Theme.AppCompat.Light.NoActionBar">',
        '        <item name="android:windowIsTranslucent">true</item>',
        '        <item name="android:windowBackground">@android:color/transparent</item>',
        '        <item name="android:windowContentOverlay">@null</item>',
        '        <item name="android:windowNoTitle">true</item>',
        '        <item name="android:windowIsFloating">true</item>',
        '        <item name="android:windowAnimationStyle">@null</item>',
        '    </style>',
      ].join('\n');

      xml = xml.replace('</resources>', theme + '\n</resources>');
      fs.writeFileSync(stylesPath, xml);

      return config;
    },
  ]);
}

// Step 2: Apply Theme.TransparentShare to every activity / activity-alias
// that declares an android.intent.action.SEND intent filter.
// expo-share-intent registers SEND filters on MainActivity itself, so that
// is the element this plugin will target.
function withShareActivityTheme(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];

    const elements = [
      ...(app.activity        || []),
      ...(app['activity-alias'] || []),
    ];

    for (const el of elements) {
      const hasSend = (el['intent-filter'] || []).some((filter) =>
        (filter.action || []).some(
          (a) => a.$?.['android:name'] === 'android.intent.action.SEND'
        )
      );
      if (hasSend) {
        el.$['android:theme'] = '@style/Theme.TransparentShare';
      }
    }

    return config;
  });
}

module.exports = function withTransparentShare(config) {
  config = withTranslucentStyles(config);
  config = withShareActivityTheme(config);
  return config;
};
