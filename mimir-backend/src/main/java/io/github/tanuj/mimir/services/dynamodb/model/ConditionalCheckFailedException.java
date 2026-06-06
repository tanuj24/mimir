package io.github.tanuj.mimir.services.dynamodb.model;

import io.github.tanuj.mimir.core.common.AwsException;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

public class ConditionalCheckFailedException extends io.github.tanuj.mimir.core.common.AwsException {

    private final JsonNode item;

    public ConditionalCheckFailedException(JsonNode Item) {
        super("ConditionalCheckFailedException", "The conditional request failed", 400);
        this.item = Item;
    }

    public JsonNode getItem() {
        return item;
    }
}
