package io.github.tanuj.mimir.services.apigateway.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record MethodResponse(
        String statusCode,
        Map<String, Boolean> responseParameters
) {
}
