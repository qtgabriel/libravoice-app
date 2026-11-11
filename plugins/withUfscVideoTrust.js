const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DOMAIN = 'videos.nals.cce.ufsc.br';
const RAW_CERT = 'ufsc_video_yr2.pem';
const CERT_SOURCE = 'plugins/certs/ufsc-video-yr2.pem';

/**
 * O servidor da UFSC envia apenas o certificado leaf, sem o intermediário
 * Let's Encrypt YR2. O Android não busca o intermediário via AIA, então o
 * ExoPlayer falha com "Trust anchor for certification path not found".
 *
 * Este plugin adiciona o YR2 como âncora de confiança APENAS para o domínio
 * dos vídeos. O restante do app continua usando o trust store do sistema.
 *
 * Em debug, preserva cleartext para a API local (http://<ip>:8000).
 * Em release, cleartext fica desabilitado.
 */
function networkSecurityConfig(cleartext) {
    return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="${cleartext}" />
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">${DOMAIN}</domain>
        <trust-anchors>
            <certificates src="@raw/${RAW_CERT.replace(/\.pem$/, '')}" />
            <certificates src="system" />
        </trust-anchors>
    </domain-config>
</network-security-config>
`;
}

module.exports = function withUfscVideoTrust(config) {
    config = withAndroidManifest(config, config => {
        const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
        application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
        return config;
    });

    config = withDangerousMod(config, [
        'android',
        async config => {
            const projectRoot = config.modRequest.projectRoot;
            const androidRoot = config.modRequest.platformProjectRoot;
            const mainRes = path.join(androidRoot, 'app', 'src', 'main', 'res');
            const debugRes = path.join(androidRoot, 'app', 'src', 'debug', 'res');

            fs.mkdirSync(path.join(mainRes, 'xml'), { recursive: true });
            fs.mkdirSync(path.join(mainRes, 'raw'), { recursive: true });
            fs.mkdirSync(path.join(debugRes, 'xml'), { recursive: true });

            // Release: cleartext desabilitado. Debug: liberado para a API local.
            fs.writeFileSync(
                path.join(mainRes, 'xml', 'network_security_config.xml'),
                networkSecurityConfig('false')
            );
            fs.writeFileSync(
                path.join(debugRes, 'xml', 'network_security_config.xml'),
                networkSecurityConfig('true')
            );
            fs.copyFileSync(
                path.join(projectRoot, CERT_SOURCE),
                path.join(mainRes, 'raw', RAW_CERT)
            );

            return config;
        },
    ]);

    return config;
};
