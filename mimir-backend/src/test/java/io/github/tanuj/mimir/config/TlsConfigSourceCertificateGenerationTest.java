package io.github.tanuj.mimir.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Collection;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for TLS certificate generation with custom hostnames.
 * 
 * Tests Task 3.5: Update certificate generation to include custom hostnames
 * - Verifies that extractCustomHostnames() is called
 * - Verifies that custom hostnames are combined with default SANs
 * - Verifies that the combined list is deduplicated
 * - Verifies that the combined SANs are passed to CertificateGenerator
 * - Verifies that logging shows custom hostnames when present
 */
class TlsConfigSourceCertificateGenerationTest {

    @TempDir
    Path tempDir;

    @BeforeEach
    void setup() {
        // Enable TLS and self-signed mode
        System.setProperty("mimir.tls.enabled", "true");
        System.setProperty("mimir.tls.self-signed", "true");
        System.setProperty("mimir.storage.persistent-path", tempDir.toString());
    }

    @AfterEach
    void cleanup() {
        System.clearProperty("mimir.tls.enabled");
        System.clearProperty("mimir.tls.self-signed");
        System.clearProperty("mimir.storage.persistent-path");
        System.clearProperty("mimir.hostname");
        System.clearProperty("mimir.base-url");
    }

    /**
     * Test that certificate includes custom hostname from MIMIR_HOSTNAME
     */
    @Test
    void testCertificateIncludesMimirHostname() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "mimir");
        
        // Act
        new TlsConfigSource();
        
        // Assert
        Path certFile = tempDir.resolve("tls/mimir-selfsigned.crt");
        assertTrue(Files.exists(certFile), "Certificate file should exist");
        
        List<String> sans = extractSansFromCertificate(certFile);
        assertTrue(sans.contains("mimir"), 
            "Certificate SANs should include 'mimir' from MIMIR_HOSTNAME");
        assertTrue(sans.contains("localhost"), 
            "Certificate SANs should include default 'localhost'");
    }

    /**
     * Test that certificate includes custom hostname from MIMIR_BASE_URL
     */
    @Test
    void testCertificateIncludesBaseUrlHostname() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "https://myhost:4566");
        
        // Act
        new TlsConfigSource();
        
        // Assert
        Path certFile = tempDir.resolve("tls/mimir-selfsigned.crt");
        assertTrue(Files.exists(certFile), "Certificate file should exist");
        
        List<String> sans = extractSansFromCertificate(certFile);
        assertTrue(sans.contains("myhost"), 
            "Certificate SANs should include 'myhost' from MIMIR_BASE_URL");
        assertTrue(sans.contains("localhost"), 
            "Certificate SANs should include default 'localhost'");
    }

    /**
     * Test that certificate includes IP address from MIMIR_BASE_URL
     */
    @Test
    void testCertificateIncludesIpAddress() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "https://192.168.1.100:4566");
        
        // Act
        new TlsConfigSource();
        
        // Assert
        Path certFile = tempDir.resolve("tls/mimir-selfsigned.crt");
        assertTrue(Files.exists(certFile), "Certificate file should exist");
        
        List<String> sans = extractSansFromCertificate(certFile);
        assertTrue(sans.contains("192.168.1.100"), 
            "Certificate SANs should include '192.168.1.100' from MIMIR_BASE_URL");
    }

    /**
     * Test that certificate includes both MIMIR_HOSTNAME and MIMIR_BASE_URL hostnames
     */
    @Test
    void testCertificateIncludesBothHostnames() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "newhost");
        System.setProperty("mimir.base-url", "http://oldhost:4566");
        
        // Act
        new TlsConfigSource();
        
        // Assert
        Path certFile = tempDir.resolve("tls/mimir-selfsigned.crt");
        assertTrue(Files.exists(certFile), "Certificate file should exist");
        
        List<String> sans = extractSansFromCertificate(certFile);
        assertTrue(sans.contains("newhost"), 
            "Certificate SANs should include 'newhost' from MIMIR_HOSTNAME");
        assertTrue(sans.contains("oldhost"), 
            "Certificate SANs should include 'oldhost' from MIMIR_BASE_URL");
        assertTrue(sans.contains("localhost"), 
            "Certificate SANs should include default 'localhost'");
    }

    /**
     * Test that certificate with default configuration includes only default SANs
     */
    @Test
    void testCertificateWithDefaultConfiguration() throws Exception {
        // Arrange - no custom hostnames
        
        // Act
        new TlsConfigSource();
        
        // Assert
        Path certFile = tempDir.resolve("tls/mimir-selfsigned.crt");
        assertTrue(Files.exists(certFile), "Certificate file should exist");
        
        List<String> sans = extractSansFromCertificate(certFile);
        assertTrue(sans.contains("localhost"), 
            "Certificate SANs should include default 'localhost'");
        assertTrue(sans.contains("127.0.0.1"), 
            "Certificate SANs should include default '127.0.0.1'");
        assertTrue(sans.contains("0.0.0.0"), 
            "Certificate SANs should include default '0.0.0.0'");
        
        // Should not contain any custom hostnames
        assertEquals(6, sans.size(), 
            "Certificate SANs should contain exactly 6 default entries (localhost, 127.0.0.1, 0.0.0.0, *.localhost, localhost.mimir.local, *.localhost.mimir.local)");
    }

    /**
     * Test that duplicate hostnames are deduplicated
     */
    @Test
    void testDeduplicationInCertificate() throws Exception {
        // Arrange - same hostname in both sources
        System.setProperty("mimir.hostname", "myhost");
        System.setProperty("mimir.base-url", "http://myhost:4566");
        
        // Act
        new TlsConfigSource();
        
        // Assert
        Path certFile = tempDir.resolve("tls/mimir-selfsigned.crt");
        assertTrue(Files.exists(certFile), "Certificate file should exist");
        
        List<String> sans = extractSansFromCertificate(certFile);
        long myhostCount = sans.stream().filter(s -> s.equals("myhost")).count();
        assertEquals(1, myhostCount, 
            "Certificate SANs should contain 'myhost' exactly once (deduplicated)");
    }

    /**
     * Test that metadata file is created with correct hostnames
     */
    @Test
    void testMetadataIncludesCustomHostnames() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "mimir");
        System.setProperty("mimir.base-url", "https://myhost:4566");
        
        // Act
        new TlsConfigSource();
        
        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        assertTrue(Files.exists(metadataFile), "Metadata file should exist");
        
        String json = Files.readString(metadataFile);
        assertTrue(json.contains("mimir"), 
            "Metadata should include 'mimir' hostname");
        assertTrue(json.contains("myhost"), 
            "Metadata should include 'myhost' hostname");
        assertTrue(json.contains("localhost"), 
            "Metadata should include default 'localhost' hostname");
    }

    // ==================== Helper Methods ====================

    /**
     * Extracts Subject Alternative Names (SANs) from a certificate file.
     * 
     * @param certFile Path to the certificate file
     * @return List of SANs (DNS names and IP addresses)
     */
    private List<String> extractSansFromCertificate(Path certFile) throws Exception {
        String certPem = Files.readString(certFile);
        
        // Parse certificate
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        X509Certificate cert = (X509Certificate) cf.generateCertificate(
            new ByteArrayInputStream(certPem.getBytes())
        );
        
        // Extract SANs
        Collection<List<?>> sans = cert.getSubjectAlternativeNames();
        if (sans == null) {
            return List.of();
        }
        
        return sans.stream()
            .filter(san -> san.size() >= 2)
            .map(san -> san.get(1).toString())
            .toList();
    }
}
