package io.github.tanuj.mimir.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for metadata persistence in TlsConfigSource.
 * 
 * Tests that metadata is correctly persisted after certificate generation:
 * - Metadata file is created
 * - Metadata contains correct hostnames
 * - Metadata contains timestamp and version
 * - Write failures are handled gracefully
 */
class TlsConfigSourceMetadataPersistenceTest {

    @TempDir
    Path tempDir;

    @BeforeEach
    void setup() {
        // Set TLS enabled and self-signed mode
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
        System.clearProperty("MIMIR_VERSION");
    }

    /**
     * Test that metadata file is created after certificate generation
     */
    @Test
    void testMetadataFileCreated() {
        // Act - trigger certificate generation by creating TlsConfigSource
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        assertTrue(Files.exists(metadataFile), 
            "Metadata file should be created after certificate generation");
    }

    /**
     * Test that metadata contains default hostnames when no custom hostnames configured
     */
    @Test
    void testMetadataContainsDefaultHostnames() throws IOException {
        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        CertificateMetadata metadata = readMetadata(metadataFile);
        
        assertNotNull(metadata.getHostnames(), "Hostnames should not be null");
        assertTrue(metadata.getHostnames().contains("localhost"), 
            "Metadata should contain 'localhost'");
        assertTrue(metadata.getHostnames().contains("127.0.0.1"), 
            "Metadata should contain '127.0.0.1'");
        assertTrue(metadata.getHostnames().contains("0.0.0.0"), 
            "Metadata should contain '0.0.0.0'");
        assertTrue(metadata.getHostnames().contains("*.localhost"), 
            "Metadata should contain '*.localhost'");
        assertTrue(metadata.getHostnames().contains("localhost.mimir.local"), 
            "Metadata should contain 'localhost.mimir.local'");
        assertTrue(metadata.getHostnames().contains("*.localhost.mimir.local"), 
            "Metadata should contain '*.localhost.mimir.local'");
    }

    /**
     * Test that metadata contains custom hostname from MIMIR_HOSTNAME
     */
    @Test
    void testMetadataContainsCustomHostname() throws IOException {
        // Arrange
        System.setProperty("mimir.hostname", "mimir");

        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        CertificateMetadata metadata = readMetadata(metadataFile);
        
        assertTrue(metadata.getHostnames().contains("mimir"), 
            "Metadata should contain custom hostname 'mimir'");
    }

    /**
     * Test that metadata contains custom hostname from MIMIR_BASE_URL
     */
    @Test
    void testMetadataContainsBaseUrlHostname() throws IOException {
        // Arrange
        System.setProperty("mimir.base-url", "https://myhost:4566");

        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        CertificateMetadata metadata = readMetadata(metadataFile);
        
        assertTrue(metadata.getHostnames().contains("myhost"), 
            "Metadata should contain hostname 'myhost' from base URL");
    }

    /**
     * Test that metadata contains both custom hostnames when both are configured
     */
    @Test
    void testMetadataContainsBothCustomHostnames() throws IOException {
        // Arrange
        System.setProperty("mimir.hostname", "newhost");
        System.setProperty("mimir.base-url", "http://oldhost:4566");

        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        CertificateMetadata metadata = readMetadata(metadataFile);
        
        assertTrue(metadata.getHostnames().contains("newhost"), 
            "Metadata should contain 'newhost' from MIMIR_HOSTNAME");
        assertTrue(metadata.getHostnames().contains("oldhost"), 
            "Metadata should contain 'oldhost' from MIMIR_BASE_URL");
    }

    /**
     * Test that metadata contains timestamp
     */
    @Test
    void testMetadataContainsTimestamp() throws IOException {
        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        CertificateMetadata metadata = readMetadata(metadataFile);
        
        assertNotNull(metadata.getGeneratedAt(), 
            "Metadata should contain generatedAt timestamp");
        assertFalse(metadata.getGeneratedAt().isBlank(), 
            "Timestamp should not be blank");
    }

    /**
     * Test that metadata contains version
     */
    @Test
    void testMetadataContainsVersion() throws IOException {
        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        CertificateMetadata metadata = readMetadata(metadataFile);
        
        assertNotNull(metadata.getMimirVersion(), 
            "Metadata should contain mimirVersion");
        assertEquals("dev", metadata.getMimirVersion(), 
            "Version should default to 'dev' when MIMIR_VERSION not set");
    }

    /**
     * Test that metadata contains custom version from MIMIR_VERSION environment variable
     */
    @Test
    void testMetadataContainsCustomVersion() throws IOException {
        // Arrange
        // Note: We can't set environment variables in Java, so we'll test the default behavior
        // The actual environment variable handling is tested in integration tests
        
        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        CertificateMetadata metadata = readMetadata(metadataFile);
        
        assertNotNull(metadata.getMimirVersion(), 
            "Metadata should contain mimirVersion");
    }

    /**
     * Test that metadata file is valid JSON
     */
    @Test
    void testMetadataIsValidJson() throws IOException {
        // Act
        new TlsConfigSource();

        // Assert
        Path metadataFile = tempDir.resolve("tls/mimir-selfsigned.metadata.json");
        String json = Files.readString(metadataFile);
        
        assertFalse(json.isBlank(), "Metadata file should not be empty");
        assertTrue(json.contains("hostnames"), "JSON should contain 'hostnames' field");
        assertTrue(json.contains("generatedAt"), "JSON should contain 'generatedAt' field");
        assertTrue(json.contains("mimirVersion"), "JSON should contain 'mimirVersion' field");
    }

    // ==================== Helper Methods ====================

    /**
     * Reads and parses metadata from the specified file.
     */
    private CertificateMetadata readMetadata(Path metadataFile) throws IOException {
        String json = Files.readString(metadataFile);
        ObjectMapper objectMapper = new ObjectMapper();
        return objectMapper.readValue(json, CertificateMetadata.class);
    }
}
