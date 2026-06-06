package io.github.tanuj.mimir.services.mimir;

import io.github.tanuj.mimir.config.EmulatorConfig;
import io.github.tanuj.mimir.core.common.docker.ContainerBuilder;
import io.github.tanuj.mimir.core.common.docker.ContainerDetector;
import io.github.tanuj.mimir.core.common.docker.ContainerLifecycleManager;
import io.github.tanuj.mimir.core.common.docker.ContainerLifecycleManager.ContainerInfo;
import io.github.tanuj.mimir.core.common.docker.ContainerLifecycleManager.EndpointInfo;
import io.github.tanuj.mimir.core.common.docker.ContainerSpec;
import io.quarkus.runtime.ShutdownEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.jboss.logging.Logger;

import java.net.HttpURLConnection;
import java.net.URI;
import java.util.Optional;

/**
 * Lazily starts and manages the mimir-duck sidecar container.
 *
 * On the first call to {@link #ensureReady()}, Mimir pulls the image and starts
 * a named container "mimir-duck". Subsequent calls return the cached URL immediately.
 *
 * If {@code mimir.services.duck.url} is configured, container management is
 * skipped entirely and that URL is used as-is — useful in Docker Compose setups where
 * the user runs mimir-duck as a separate service.
 */
@ApplicationScoped
public class MimirDuckManager {

    private static final Logger LOG = Logger.getLogger(MimirDuckManager.class);
    private static final String CONTAINER_NAME = "mimir-duck";
    private static final int DUCK_PORT = 3000;
    private static final int HEALTH_POLL_MAX_MS = 30_000;
    private static final int HEALTH_POLL_INTERVAL_MS = 500;

    private final ContainerBuilder containerBuilder;
    private final ContainerLifecycleManager lifecycleManager;
    private final ContainerDetector containerDetector;
    private final EmulatorConfig config;

    private volatile String resolvedUrl;
    private volatile String containerId;

    @Inject
    public MimirDuckManager(ContainerBuilder containerBuilder,
                            ContainerLifecycleManager lifecycleManager,
                            ContainerDetector containerDetector,
                            EmulatorConfig config) {
        this.containerBuilder = containerBuilder;
        this.lifecycleManager = lifecycleManager;
        this.containerDetector = containerDetector;
        this.config = config;
    }

    /**
     * Returns true if mimir-duck is reachable without starting anything.
     * If a URL is pre-configured and healthy, that URL is cached for future ensureReady() calls.
     */
    public synchronized boolean isAvailable() {
        if (resolvedUrl != null) {
            return true;
        }
        Optional<String> configured = config.services().duck().url();
        if (configured.isPresent() && !configured.get().isBlank()) {
            String url = configured.get();
            if (probeHealth(url)) {
                resolvedUrl = url;
                LOG.infov("mimir-duck is available at pre-configured URL: {0}", url);
                return true;
            }
        }
        return false;
    }

    private boolean probeHealth(String baseUrl) {
        try {
            HttpURLConnection conn = (HttpURLConnection) URI.create(baseUrl + "/health").toURL().openConnection();
            conn.setConnectTimeout(500);
            conn.setReadTimeout(500);
            return conn.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Returns the mimir-duck base URL, starting the container on first call if needed.
     * Thread-safe — concurrent callers wait while the first thread does the pull+start.
     */
    public synchronized String ensureReady() {
        if (resolvedUrl != null) {
            return resolvedUrl;
        }

        Optional<String> configured = config.services().duck().url();
        if (configured.isPresent() && !configured.get().isBlank()) {
            resolvedUrl = configured.get();
            LOG.infov("Using pre-configured mimir-duck URL: {0}", resolvedUrl);
            return resolvedUrl;
        }

        startContainer();
        return resolvedUrl;
    }

    private void startContainer() {
        String image = config.services().duck().defaultImage();
        LOG.infov("Starting mimir-duck container using image {0}", image);

        lifecycleManager.removeIfExists(CONTAINER_NAME);

        ContainerSpec spec = containerBuilder.newContainer(image)
                .withName(CONTAINER_NAME)
                .withEnv("MIMIR_DUCK_S3_ACCESS_KEY", "test")
                .withEnv("MIMIR_DUCK_S3_SECRET_KEY", "test")
                .withEnv("MIMIR_DUCK_S3_REGION", config.defaultRegion())
                .withPortBinding(DUCK_PORT, DUCK_PORT)
                .withDockerNetwork(config.services().dockerNetwork())
                .withEmbeddedDns()
                .withLogRotation()
                .build();

        ContainerInfo info = lifecycleManager.createAndStart(spec);
        EndpointInfo endpoint = info.getEndpoint(DUCK_PORT);
        containerId = info.containerId();

        String url = "http://" + endpoint;
        LOG.infov("mimir-duck container started, waiting for health check at {0}", url);
        waitForHealth(url);

        resolvedUrl = url;
        LOG.infov("mimir-duck is ready at {0}", resolvedUrl);
    }

    private void waitForHealth(String baseUrl) {
        String healthUrl = baseUrl + "/health";
        long deadline = System.currentTimeMillis() + HEALTH_POLL_MAX_MS;

        while (System.currentTimeMillis() < deadline) {
            try {
                HttpURLConnection conn = (HttpURLConnection) URI.create(healthUrl).toURL().openConnection();
                conn.setConnectTimeout(2000);
                conn.setReadTimeout(2000);
                if (conn.getResponseCode() == 200) {
                    return;
                }
            } catch (Exception ignored) {
            }
            try {
                Thread.sleep(HEALTH_POLL_INTERVAL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("Interrupted while waiting for mimir-duck", e);
            }
        }
        throw new RuntimeException("mimir-duck did not become healthy within " + HEALTH_POLL_MAX_MS + " ms");
    }

    void onStop(@Observes ShutdownEvent event) {
        if (containerId == null) {
            return;
        }
        LOG.info("Stopping mimir-duck container");
        lifecycleManager.stopAndRemove(containerId, null);
    }
}
