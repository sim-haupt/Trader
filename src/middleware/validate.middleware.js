const ApiError = require("../utils/ApiError");

function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(
        new ApiError(400, "Validation failed", result.error.flatten())
      );
    }

    if (source === "body") {
      req.validatedBody = result.data;
    } else if (source === "query") {
      req.validatedQuery = result.data;
    } else if (source === "params") {
      req.validatedParams = result.data;
    }

    next();
  };
}

module.exports = validate;
