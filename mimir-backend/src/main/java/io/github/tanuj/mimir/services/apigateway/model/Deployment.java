package io.github.tanuj.mimir.services.apigateway.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Deployment(
        String id,
        String description,
        long createdDate
) {
}
