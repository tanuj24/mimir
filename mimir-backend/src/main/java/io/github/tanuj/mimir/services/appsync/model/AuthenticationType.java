package io.github.tanuj.mimir.services.appsync.model;

public enum AuthenticationType {
    API_KEY,
    AWS_IAM,
    AMAZON_COGNITO_USER_POOLS,
    OPENID_CONNECT,
    AWS_LAMBDA
}
