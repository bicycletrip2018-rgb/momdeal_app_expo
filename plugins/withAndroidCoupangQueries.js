const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidCoupangQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [];
    }

    // <package android:name="com.coupang.mobile" />
    const hasPkg = manifest.queries.some(
      (q) => q.package?.[0]?.['$']?.['android:name'] === 'com.coupang.mobile'
    );
    if (!hasPkg) {
      manifest.queries.push({
        package: [{ $: { 'android:name': 'com.coupang.mobile' } }],
      });
    }

    // <intent><action VIEW /><data scheme="coupang" /></intent>
    const hasIntent = manifest.queries.some(
      (q) => q.intent?.[0]?.data?.[0]?.['$']?.['android:scheme'] === 'coupang'
    );
    if (!hasIntent) {
      manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data:   [{ $: { 'android:scheme': 'coupang' } }],
          },
        ],
      });
    }

    return config;
  });
};
