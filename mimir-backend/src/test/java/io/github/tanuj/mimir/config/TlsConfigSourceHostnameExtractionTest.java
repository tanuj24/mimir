package io.github.tanuj.mimir.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for hostname extraction logic in TlsConfigSource.
 * 
 * Tests the extractCustomHostnames() method to verify:
 * - Extraction from MIMIR_HOSTNAME
 * - Extraction from MIMIR_BASE_URL (DNS names and IP addresses)
 * - Filtering of default values (localhost, 127.0.0.1, 0.0.0.0)
 * - Deduplication of hostnames
 * - Edge case handling (malformed URLs, missing host, IPv6 addresses)
 */
class TlsConfigSourceHostnameExtractionTest {

    @AfterEach
    void cleanupSystemProperties() {
        System.clearProperty("mimir.hostname");
        System.clearProperty("mimir.base-url");
    }

    /**
     * Test extraction from MIMIR_HOSTNAME
     */
    @Test
    void testExtractFromMimirHostname() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "mimir");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.contains("mimir"), 
            "Should extract 'mimir' from MIMIR_HOSTNAME");
    }

    /**
     * Test extraction from MIMIR_BASE_URL with DNS name
     */
    @Test
    void testExtractFromBaseUrlDnsName() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "https://myhost:4566");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.contains("myhost"), 
            "Should extract 'myhost' from MIMIR_BASE_URL");
    }

    /**
     * Test extraction from MIMIR_BASE_URL with IP address
     */
    @Test
    void testExtractFromBaseUrlIpAddress() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "https://192.168.1.100:4566");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.contains("192.168.1.100"), 
            "Should extract '192.168.1.100' from MIMIR_BASE_URL");
    }

    /**
     * Test extraction from both MIMIR_HOSTNAME and MIMIR_BASE_URL
     */
    @Test
    void testExtractFromBothSources() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "newhost");
        System.setProperty("mimir.base-url", "http://oldhost:4566");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.contains("newhost"), 
            "Should extract 'newhost' from MIMIR_HOSTNAME");
        assertTrue(hostnames.contains("oldhost"), 
            "Should extract 'oldhost' from MIMIR_BASE_URL");
        assertEquals(2, hostnames.size(), 
            "Should contain exactly 2 hostnames");
    }

    /**
     * Test filtering of default hostname "localhost"
     */
    @Test
    void testFilterDefaultLocalhostFromHostname() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "localhost");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.isEmpty(), 
            "Should filter out 'localhost' as it's a default value");
    }

    /**
     * Test filtering of default IP "127.0.0.1"
     */
    @Test
    void testFilterDefaultLoopbackIp() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "http://127.0.0.1:4566");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.isEmpty(), 
            "Should filter out '127.0.0.1' as it's a default value");
    }

    /**
     * Test filtering of default IP "0.0.0.0"
     */
    @Test
    void testFilterDefaultAllInterfacesIp() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "http://0.0.0.0:4566");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.isEmpty(), 
            "Should filter out '0.0.0.0' as it's a default value");
    }

    /**
     * Test deduplication when same hostname appears in both sources
     */
    @Test
    void testDeduplication() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "myhost");
        System.setProperty("mimir.base-url", "http://myhost:4566");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertEquals(1, hostnames.size(), 
            "Should deduplicate 'myhost' appearing in both sources");
        assertTrue(hostnames.contains("myhost"), 
            "Should contain 'myhost'");
    }

    /**
     * Test handling of malformed URL
     */
    @Test
    void testMalformedUrl() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "not-a-valid-url");
        
        // Act & Assert - should not throw exception
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Should return empty list (malformed URL is logged but doesn't fail)
        assertTrue(hostnames.isEmpty(), 
            "Should return empty list for malformed URL");
    }

    /**
     * Test handling of URL without host
     */
    @Test
    void testUrlWithoutHost() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "file:///path/to/file");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.isEmpty(), 
            "Should return empty list for URL without host");
    }

    /**
     * Test empty configuration (no custom hostnames)
     */
    @Test
    void testEmptyConfiguration() throws Exception {
        // Arrange - no properties set
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.isEmpty(), 
            "Should return empty list when no custom hostnames configured");
    }

    /**
     * Test blank MIMIR_HOSTNAME is ignored
     */
    @Test
    void testBlankHostname() throws Exception {
        // Arrange
        System.setProperty("mimir.hostname", "   ");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        assertTrue(hostnames.isEmpty(), 
            "Should ignore blank MIMIR_HOSTNAME");
    }

    /**
     * Test IPv6 address extraction
     * Note: URI.getHost() returns IPv6 addresses with brackets
     */
    @Test
    void testIpv6Address() throws Exception {
        // Arrange
        System.setProperty("mimir.base-url", "http://[::1]:4566");
        
        // Act
        List<String> hostnames = invokeExtractCustomHostnames();
        
        // Assert
        // IPv6 loopback should be extracted (URI.getHost() returns it with brackets)
        assertTrue(hostnames.contains("[::1]"), 
            "Should extract IPv6 address '[::1]' from MIMIR_BASE_URL");
    }

    // ==================== Helper Methods ====================

    /**
     * Invokes the private extractCustomHostnames() method using reflection.
     */
    @SuppressWarnings("unchecked")
    private List<String> invokeExtractCustomHostnames() throws Exception {
        TlsConfigSource configSource = new TlsConfigSource();
        Method method = TlsConfigSource.class.getDeclaredMethod("extractCustomHostnames");
        method.setAccessible(true);
        return (List<String>) method.invoke(configSource);
    }
}
