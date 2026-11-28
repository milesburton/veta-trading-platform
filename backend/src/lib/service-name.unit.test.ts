import { test } from "#veta/test";
import { assertEquals } from "#veta/test-assert";
import { withInstanceId } from "./service-name.ts";

test("[service-name] adds the instance id when no resource attributes are set", () => {
  assertEquals(withInstanceId(undefined, "a1b2c3"), "service.instance.id=a1b2c3");
  assertEquals(withInstanceId("", "a1b2c3"), "service.instance.id=a1b2c3");
});

test("[service-name] appends the instance id to existing resource attributes", () => {
  assertEquals(
    withInstanceId("deployment.environment=prod", "a1b2c3"),
    "deployment.environment=prod,service.instance.id=a1b2c3"
  );
});

test("[service-name] keeps an instance id that was set explicitly", () => {
  assertEquals(
    withInstanceId("service.instance.id=fixed,team=core", "a1b2c3"),
    "service.instance.id=fixed,team=core"
  );
});

test("[service-name] percent-encodes characters reserved in the attribute list", () => {
  assertEquals(withInstanceId(undefined, "host,1=x"), "service.instance.id=host%2C1%3Dx");
});
