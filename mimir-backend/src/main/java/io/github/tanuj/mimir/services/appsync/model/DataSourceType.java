package io.github.tanuj.mimir.services.appsync.model;

public enum DataSourceType {
    NONE,
    AWS_LAMBDA,
    AMAZON_DYNAMODB,
    HTTP,
    AMAZON_EVENTBRIDGE,
    RELATIONAL_DATABASE,
    AMAZON_OPENSEARCH_SERVICE,
    AMAZON_BEDROCK_RUNTIME
}
