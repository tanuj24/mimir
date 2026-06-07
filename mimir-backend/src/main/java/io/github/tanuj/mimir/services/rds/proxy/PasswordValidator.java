package io.github.tanuj.mimir.services.rds.proxy;

@FunctionalInterface
    public interface PasswordValidator {
        boolean validate(String username, String password);
    }