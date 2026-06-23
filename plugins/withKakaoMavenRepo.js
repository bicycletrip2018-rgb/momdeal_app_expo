const { withProjectBuildGradle } = require('@expo/config-plugins');

const KAKAO_MAVEN = "maven { url 'https://devrepo.kakao.com/nexus/content/groups/public/' }";

module.exports = function withKakaoMavenRepo(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('devrepo.kakao.com')) {
      return config; // already injected
    }

    // Append inside allprojects { repositories { ... } }
    config.modResults.contents = config.modResults.contents.replace(
      /allprojects\s*\{[^}]*repositories\s*\{/,
      (match) => `${match}\n        ${KAKAO_MAVEN}`
    );

    return config;
  });
};
