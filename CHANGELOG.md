# Changelog

## [1.65.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.64.3...veta-trading-platform-v1.65.0) (2026-08-23)


### Features

* **fleet:** full service-registry visibility, tri-state health, fix fix-exchange routing ([#588](https://github.com/milesburton/veta-trading-platform/issues/588)) ([eba4704](https://github.com/milesburton/veta-trading-platform/commit/eba47048d5dff684043be0a3d9a54160efa4d4c8))

## [1.64.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.64.2...veta-trading-platform-v1.64.3) (2026-08-23)


### Bug Fixes

* **market-sim:** raise mem_limit to stop OOM-restart loop ([#584](https://github.com/milesburton/veta-trading-platform/issues/584)) ([b3380fb](https://github.com/milesburton/veta-trading-platform/commit/b3380fbd3de11b0e055e7d242e6473824dd980fc))

## [1.64.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.64.1...veta-trading-platform-v1.64.2) (2026-08-22)


### Bug Fixes

* **frontend:** stop sign-in page gradient going flat below the fold ([#580](https://github.com/milesburton/veta-trading-platform/issues/580)) ([3b3ec5a](https://github.com/milesburton/veta-trading-platform/commit/3b3ec5a59a569c84f97a10c4267529bc0de8fce6))

## [1.64.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.64.0...veta-trading-platform-v1.64.1) (2026-08-21)


### Bug Fixes

* restore sign-in gradient and register synthetic-trader services ([#577](https://github.com/milesburton/veta-trading-platform/issues/577)) ([a44dd57](https://github.com/milesburton/veta-trading-platform/commit/a44dd57d4c56d9d58723d40702f7ff885bd0555c))

## [1.64.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.63.1...veta-trading-platform-v1.64.0) (2026-08-16)


### Features

* **fix:** close FIX engine gaps — venue routing, market-hours, risk checks, cancel/replace, archival ([501070d](https://github.com/milesburton/veta-trading-platform/commit/501070db6b1a196cd150f0499004d51b6d5ed5aa))


### Bug Fixes

* **frontend:** merge order-book diff updates instead of replacing the whole book ([c8e94b4](https://github.com/milesburton/veta-trading-platform/commit/c8e94b4f95e0f1d79394d709ffa5355324854b2a))
* **frontend:** pin the page gradient to the viewport instead of the scrolling box ([51d5ed2](https://github.com/milesburton/veta-trading-platform/commit/51d5ed24b4d428ef928c18a7953df97e353f1200))
* **frontend:** portal the services-bar dropdown to escape OverflowBar clipping ([1922f3c](https://github.com/milesburton/veta-trading-platform/commit/1922f3c5fddbf5902ce7a27cd326e76a41914c19))

## [1.63.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.63.0...veta-trading-platform-v1.63.1) (2026-08-13)


### Bug Fixes

* **synthetic-trader:** don't fatal-exit on a missing password when the desk is disabled ([#573](https://github.com/milesburton/veta-trading-platform/issues/573)) ([c15a8fb](https://github.com/milesburton/veta-trading-platform/commit/c15a8fb73918310ef74a883283dc3b6672c22d05))

## [1.63.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.62.0...veta-trading-platform-v1.63.0) (2026-08-13)


### Features

* **market-sim:** restructure market-hours admin API to per-asset-class ([#571](https://github.com/milesburton/veta-trading-platform/issues/571)) ([0926321](https://github.com/milesburton/veta-trading-platform/commit/0926321dbebb5e269e2d9de58e6350303f06f98d))

## [1.62.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.61.0...veta-trading-platform-v1.62.0) (2026-08-13)


### Features

* **risk-engine:** enforce real market hours as an 11th pre-trade check ([#567](https://github.com/milesburton/veta-trading-platform/issues/567)) ([f10da3c](https://github.com/milesburton/veta-trading-platform/commit/f10da3cc067a96f053a1d88f853a603620a5ed63))


### Bug Fixes

* **synthetic-trader:** gate order generation per-desk, not on US equity hours ([#568](https://github.com/milesburton/veta-trading-platform/issues/568)) ([faa465c](https://github.com/milesburton/veta-trading-platform/commit/faa465c707faa93d0a4760ec2a6fb806e0352b1d))
* **tests:** consume response body in risk-rejection.integration.tc.test.ts ([a2af3d0](https://github.com/milesburton/veta-trading-platform/commit/a2af3d0cac5d8bd5c441e681dfd90fcc51fbdab7))
* **tests:** consume the reset PUT /config response body in risk-rejection.integration.tc.test.ts ([2eb48bd](https://github.com/milesburton/veta-trading-platform/commit/2eb48bdd55ee6ba914d1162f828791c985ce20d0))

## [1.61.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.60.3...veta-trading-platform-v1.61.0) (2026-08-13)


### Features

* **market-hours:** port trading calendar model to the backend ([#565](https://github.com/milesburton/veta-trading-platform/issues/565)) ([df1e67a](https://github.com/milesburton/veta-trading-platform/commit/df1e67ac2afa5b933d96ba5d00427dbe04e9ebb8))

## [1.60.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.60.2...veta-trading-platform-v1.60.3) (2026-08-12)


### Bug Fixes

* **frontend:** make light theme production-ready (Phase 1) ([#562](https://github.com/milesburton/veta-trading-platform/issues/562)) ([8cb1d21](https://github.com/milesburton/veta-trading-platform/commit/8cb1d21d97084bc4ecbf33886a404beff31a08d3))
* **frontend:** strengthen the page background gradient ([#564](https://github.com/milesburton/veta-trading-platform/issues/564)) ([0f3c4d0](https://github.com/milesburton/veta-trading-platform/commit/0f3c4d030a27578e79dac44e825b59163997a94a))

## [1.60.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.60.1...veta-trading-platform-v1.60.2) (2026-08-12)


### Bug Fixes

* **frontend:** show the page gradient on the trading dashboard too ([#560](https://github.com/milesburton/veta-trading-platform/issues/560)) ([f5bb50d](https://github.com/milesburton/veta-trading-platform/commit/f5bb50d47fe725d6f1f1ad24d424945431474d9d))

## [1.60.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.60.0...veta-trading-platform-v1.60.1) (2026-08-11)


### Bug Fixes

* **docs:** sync dark-mode background colour with the trading app ([#557](https://github.com/milesburton/veta-trading-platform/issues/557)) ([a44d4f2](https://github.com/milesburton/veta-trading-platform/commit/a44d4f28e2eeb1320014c78d61c14933510881c8))

## [1.60.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.59.1...veta-trading-platform-v1.60.0) (2026-08-11)


### Features

* **synthetic-trader:** run one instance per desk archetype ([#556](https://github.com/milesburton/veta-trading-platform/issues/556)) ([b730baf](https://github.com/milesburton/veta-trading-platform/commit/b730baf740f9e501c9c4fdceef59454e16661612))


### Bug Fixes

* **deploy:** add synthetic-trader to compose.prod.yml's image override ([#554](https://github.com/milesburton/veta-trading-platform/issues/554)) ([ddc08a0](https://github.com/milesburton/veta-trading-platform/commit/ddc08a047da097aeb82e835096d23c68c04833b6))

## [1.59.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.59.0...veta-trading-platform-v1.59.1) (2026-08-11)


### Bug Fixes

* **deploy:** publish synthetic-trader image; catch 404 in the holding page ([#552](https://github.com/milesburton/veta-trading-platform/issues/552)) ([e2dfdf6](https://github.com/milesburton/veta-trading-platform/commit/e2dfdf6d22dece40cd556d3752b2a7649bd2ef8f))

## [1.59.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.58.0...veta-trading-platform-v1.59.0) (2026-08-10)


### Features

* **synthetic-trader:** add a continuous market-hours-aware trading agent ([#550](https://github.com/milesburton/veta-trading-platform/issues/550)) ([99428ba](https://github.com/milesburton/veta-trading-platform/commit/99428baa455aa858a7214aef8cbfe0c03d29af73))

## [1.58.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.57.2...veta-trading-platform-v1.58.0) (2026-08-10)


### Features

* **ci:** alert Discord and tighten cadence on load test failures ([#547](https://github.com/milesburton/veta-trading-platform/issues/547)) ([a3ed5f2](https://github.com/milesburton/veta-trading-platform/commit/a3ed5f2d4ccdad38db084c421fb09f609e1eed3e))


### Bug Fixes

* **ci:** skip post-deploy probe wait on docs-only pushes ([#545](https://github.com/milesburton/veta-trading-platform/issues/545)) ([9956611](https://github.com/milesburton/veta-trading-platform/commit/9956611c7b93c058e18fa789b77a7bf724906c25))

## [1.57.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.57.1...veta-trading-platform-v1.57.2) (2026-08-10)


### Bug Fixes

* **status:** match milesburton.com's actual gradient technique ([5018725](https://github.com/milesburton/veta-trading-platform/commit/5018725969ffa0b896f81ff4246919a06a4b2afa))

## [1.57.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.57.0...veta-trading-platform-v1.57.1) (2026-08-09)


### Bug Fixes

* **edge:** redirect to the status page instead of proxying it in place ([#539](https://github.com/milesburton/veta-trading-platform/issues/539)) ([bcb6d2e](https://github.com/milesburton/veta-trading-platform/commit/bcb6d2e335b51fb0d7ba1ab5abde9d61e00606fd))

## [1.57.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.11...veta-trading-platform-v1.57.0) (2026-08-09)


### Features

* **frontend:** add order-routing Sankey and world-clocks panels ([#530](https://github.com/milesburton/veta-trading-platform/issues/530)) ([5da6fba](https://github.com/milesburton/veta-trading-platform/commit/5da6fba2c89743df12266af416f96c7338e5c4bd))


### Bug Fixes

* **devcontainer:** avoid internet access during container startup ([b919afd](https://github.com/milesburton/veta-trading-platform/commit/b919afdc2bed57c2bb013a12584de5e2afe9dc74))
* **gateway:** expose CORS_ALLOWED_ORIGINS in compose so prod can set it ([#540](https://github.com/milesburton/veta-trading-platform/issues/540)) ([a89715b](https://github.com/milesburton/veta-trading-platform/commit/a89715b2844189e2a0397bf4f30b6e1c2d3f6725))

## [1.56.11](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.10...veta-trading-platform-v1.56.11) (2026-08-07)


### Bug Fixes

* **deploy:** detect skip-ci commits via CI workflow runs, not check-run count ([#531](https://github.com/milesburton/veta-trading-platform/issues/531)) ([922e95d](https://github.com/milesburton/veta-trading-platform/commit/922e95d513a2d75d8e915e471bc73cce4bb0fe07))
* **deploy:** exempt secrets/ from the ownership drift guard ([#533](https://github.com/milesburton/veta-trading-platform/issues/533)) ([ccacd07](https://github.com/milesburton/veta-trading-platform/commit/ccacd0791b682faf204c00038b7bdcb58c7182a8))

## [1.56.10](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.9...veta-trading-platform-v1.56.10) (2026-08-06)


### Bug Fixes

* **sniper:** guard against silent null-producer routing failure ([becd5eb](https://github.com/milesburton/veta-trading-platform/commit/becd5eb0bccbdf5d2a0debd64e8594b5fb0d2871))
* **sniper:** prevent duplicate in-flight routing ([a93da02](https://github.com/milesburton/veta-trading-platform/commit/a93da024cc0478a21301d144d7193e01687d519f)), ([d8f79a1](https://github.com/milesburton/veta-trading-platform/commit/d8f79a1f0b3cd137af7c88811c701e4d8b75c740))

## [1.56.9](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.8...veta-trading-platform-v1.56.9) (2026-08-01)


### Bug Fixes

* **observability:** activate actionable Redpanda alerts ([#518](https://github.com/milesburton/veta-trading-platform/issues/518)) ([0d563b6](https://github.com/milesburton/veta-trading-platform/commit/0d563b6fb57347ac70718d9e621efaa29190c1da))

## [1.56.8](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.7...veta-trading-platform-v1.56.8) (2026-07-31)


### Bug Fixes

* **market-data:** secure and consolidate live feeds ([#516](https://github.com/milesburton/veta-trading-platform/issues/516)) ([8d9bfc0](https://github.com/milesburton/veta-trading-platform/commit/8d9bfc03784cd9cabc707cbab388dd80909a6026))

## [1.56.7](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.6...veta-trading-platform-v1.56.7) (2026-07-30)


### Bug Fixes

* **ci:** gate merges on visual anomalies ([#514](https://github.com/milesburton/veta-trading-platform/issues/514)) ([e30a5be](https://github.com/milesburton/veta-trading-platform/commit/e30a5befb59c40586a4f6adfc2c5dd117d024971))

## [1.56.6](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.5...veta-trading-platform-v1.56.6) (2026-07-28)


### Bug Fixes

* **docs:** clarify header controls ([#512](https://github.com/milesburton/veta-trading-platform/issues/512)) ([b1666bf](https://github.com/milesburton/veta-trading-platform/commit/b1666bfc8a56400454b1b1e538a74d71b3847e23))

## [1.56.5](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.4...veta-trading-platform-v1.56.5) (2026-07-28)


### Bug Fixes

* **ui:** clean header links and clarify theme control ([#509](https://github.com/milesburton/veta-trading-platform/issues/509)) ([fae8af7](https://github.com/milesburton/veta-trading-platform/commit/fae8af7ead047040169dcc088633527eabf36f02))

## [1.56.4](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.3...veta-trading-platform-v1.56.4) (2026-07-23)


### Bug Fixes

* **compose:** segment the network to close the no-egress-firewall gap ([#505](https://github.com/milesburton/veta-trading-platform/issues/505)) ([1d652a0](https://github.com/milesburton/veta-trading-platform/commit/1d652a0703f1d37ba2720e81e6feb54ff1010f42))
* **frontend:** correct indentation in TradingContext.test.tsx ([#508](https://github.com/milesburton/veta-trading-platform/issues/508)) ([7bcbae9](https://github.com/milesburton/veta-trading-platform/commit/7bcbae9f675d75645697d5d9936abbb8006b3b62))

## [1.56.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.2...veta-trading-platform-v1.56.3) (2026-07-22)


### Bug Fixes

* **deps:** patch 4 open Dependabot alerts in frontend/package-lock.json ([#498](https://github.com/milesburton/veta-trading-platform/issues/498)) ([ec2af82](https://github.com/milesburton/veta-trading-platform/commit/ec2af829a78193cd6b0bac2c94e81fb216c8d371))

## [1.56.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.1...veta-trading-platform-v1.56.2) (2026-07-22)


### Bug Fixes

* **market-sim:** resolve CPU contention, Redpanda race, and LIMIT fillCount race in integration tests ([#493](https://github.com/milesburton/veta-trading-platform/issues/493)) ([18a7cef](https://github.com/milesburton/veta-trading-platform/commit/18a7cefb189c292fcdc08af9b8bdee0dad64376a))
* **market-sim:** stop /seed from blocking the event loop during scenario reruns ([#497](https://github.com/milesburton/veta-trading-platform/issues/497)) ([135606f](https://github.com/milesburton/veta-trading-platform/commit/135606f220a84f97c0114d7a853367abc0635415))

## [1.56.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.56.0...veta-trading-platform-v1.56.1) (2026-07-20)


### Bug Fixes

* **market-sim:** resolve CPU contention causing integration test timeouts ([#490](https://github.com/milesburton/veta-trading-platform/issues/490)) ([1b7a079](https://github.com/milesburton/veta-trading-platform/commit/1b7a0795d3ca5a48cce9bc9259ba1eaa36aab115))

## [1.56.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.55.0...veta-trading-platform-v1.56.0) (2026-07-14)


### Features

* **alerts:** raise Discord alert on wide bid-ask spread ([#487](https://github.com/milesburton/veta-trading-platform/issues/487)) ([e6b8b25](https://github.com/milesburton/veta-trading-platform/commit/e6b8b258bbdb358991792dba8b36577b182562ab))
* **discord-bot:** greet new members via Discord Gateway ([#486](https://github.com/milesburton/veta-trading-platform/issues/486)) ([c8b25c0](https://github.com/milesburton/veta-trading-platform/commit/c8b25c0b182c1c4a71ae4fbd590c57c289db0d3c))

## [1.55.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.54.0...veta-trading-platform-v1.55.0) (2026-07-12)


### Features

* **ticketing:** create GitHub issues for user tickets ([#483](https://github.com/milesburton/veta-trading-platform/issues/483)) ([48ebe36](https://github.com/milesburton/veta-trading-platform/commit/48ebe3641c7a232c3cbbc5e5ed08c84e39326154))

## [1.54.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.53.3...veta-trading-platform-v1.54.0) (2026-07-12)


### Features

* **frontend:** reorganise header, combine VETA+env badge, label all icons ([#481](https://github.com/milesburton/veta-trading-platform/issues/481)) ([3ffe6a8](https://github.com/milesburton/veta-trading-platform/commit/3ffe6a8b3a0a7778bafdd633e9492863b12347f0))

## [1.53.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.53.2...veta-trading-platform-v1.53.3) (2026-07-12)


### Bug Fixes

* algo type-check, load-test quantity validation, homelab deploy race ([#477](https://github.com/milesburton/veta-trading-platform/issues/477)) ([d62a45a](https://github.com/milesburton/veta-trading-platform/commit/d62a45a501f8591951a63a77e1e7116777791d57))
* **homelab:** detect skip-ci by absence of check-runs, not message text ([#478](https://github.com/milesburton/veta-trading-platform/issues/478)) ([7833c00](https://github.com/milesburton/veta-trading-platform/commit/7833c00fc6f67b44103d62dac784dc44f7de96d6))
* **homelab:** raise auto-pull's systemd timeout from 10min to 60min ([#479](https://github.com/milesburton/veta-trading-platform/issues/479)) ([9e2b568](https://github.com/milesburton/veta-trading-platform/commit/9e2b568f575c56bbb7986d9331c4b0ba2a6e237e))

## [1.53.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.53.1...veta-trading-platform-v1.53.2) (2026-07-04)


### Bug Fixes

* **docs:** remove dead code flagged by CodeQL unused-local-variable ([#475](https://github.com/milesburton/veta-trading-platform/issues/475)) ([0680018](https://github.com/milesburton/veta-trading-platform/commit/06800189a5103030c867b9aed32c6774f4509f27))

## [1.53.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.53.0...veta-trading-platform-v1.53.1) (2026-07-04)


### Bug Fixes

* **test:** robust panel-ready wait using elementHandle polling ([#472](https://github.com/milesburton/veta-trading-platform/issues/472)) ([9626050](https://github.com/milesburton/veta-trading-platform/commit/96260500d5281bd5abe301b803cdc05f1681ac9b))

## [1.53.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.52.0...veta-trading-platform-v1.53.0) (2026-06-23)


### Features

* **algos:** migrate remaining 8 strategies to createTypedConsumer ([#376](https://github.com/milesburton/veta-trading-platform/issues/376)) ([b25701d](https://github.com/milesburton/veta-trading-platform/commit/b25701d8f6c67ab794db2c18d4b726b71f2dc87b))
* **db:** guard against destructive migrations (expand/contract) ([#443](https://github.com/milesburton/veta-trading-platform/issues/443)) ([4d25d32](https://github.com/milesburton/veta-trading-platform/commit/4d25d3237fdbdd82b7dd8dd73c5d35e2868cbab5))
* **dx:** panel scaffolding generator + Claude provider for llm-advisory ([#437](https://github.com/milesburton/veta-trading-platform/issues/437)) ([ddba5a2](https://github.com/milesburton/veta-trading-platform/commit/ddba5a24a1bc2bd4292c07b62aa91e165da39da9))
* **frontend:** bug-report icon + modal that posts to gateway ([#300](https://github.com/milesburton/veta-trading-platform/issues/300)) ([e262e52](https://github.com/milesburton/veta-trading-platform/commit/e262e5215fcbb9f32726ffb760c1e0b21ec4dd16))
* **frontend:** Platform Status panel with bug-report submission ([#332](https://github.com/milesburton/veta-trading-platform/issues/332)) ([40bfb14](https://github.com/milesburton/veta-trading-platform/commit/40bfb1435bfb625fc85227279923af3dca8e1e41))
* **gateway:** escalate abuse from frame rate-limit to force-close + user-level backoff ([#350](https://github.com/milesburton/veta-trading-platform/issues/350)) ([a0552a6](https://github.com/milesburton/veta-trading-platform/commit/a0552a687c09d93a06923878d65d05122f71cc8d))
* **grid:** interactive column freeze for Order Blotter and Executions ([#460](https://github.com/milesburton/veta-trading-platform/issues/460)) ([c5553ce](https://github.com/milesburton/veta-trading-platform/commit/c5553ceb5e24f6b6ce27d93d90f0b9f6d4d12e67))
* **loadgen:** announce start/stop to Discord so alerts channel knows to disregard ([#354](https://github.com/milesburton/veta-trading-platform/issues/354)) ([b5533f8](https://github.com/milesburton/veta-trading-platform/commit/b5533f88b90c58598cc4c24f4b48d30a54b15370))
* **messaging:** createTypedConsumer + EMS first adopter ([#371](https://github.com/milesburton/veta-trading-platform/issues/371)) ([5cdcbfd](https://github.com/milesburton/veta-trading-platform/commit/5cdcbfd27b83f3c43052c23a1df82f37e2769680))
* **messaging:** migrate subscribeNewsSignals + limit-strategy to createTypedConsumer ([#374](https://github.com/milesburton/veta-trading-platform/issues/374)) ([70ea5e9](https://github.com/milesburton/veta-trading-platform/commit/70ea5e949d3bc798290b958eabd6dff29c390c72))
* **observability:** emit process_memory_usage_bytes from every Deno service ([#345](https://github.com/milesburton/veta-trading-platform/issues/345)) ([f907275](https://github.com/milesburton/veta-trading-platform/commit/f9072751edc28c0ebc7fca06debff31cb5b3b540))
* panel generator, Claude llm-advisory provider, FIX docs + MCP server ([#439](https://github.com/milesburton/veta-trading-platform/issues/439)) ([cab3ae5](https://github.com/milesburton/veta-trading-platform/commit/cab3ae5618259c599acace41c955984cfb6a6397))
* **prefs:** persist all UI state + docs sweep + panel reference fix ([#465](https://github.com/milesburton/veta-trading-platform/issues/465)) ([b040333](https://github.com/milesburton/veta-trading-platform/commit/b040333b5f4d8b0044794906a0b1771ba2675f35))
* **prefs:** persist all UI state and add regulatory audit trail ([#463](https://github.com/milesburton/veta-trading-platform/issues/463)) ([e1497e9](https://github.com/milesburton/veta-trading-platform/commit/e1497e9efecbf74f154f5ca62ed7c5035fbfea51))
* **registration:** require a trader archetype on sign-up ([#393](https://github.com/milesburton/veta-trading-platform/issues/393)) ([c1c5161](https://github.com/milesburton/veta-trading-platform/commit/c1c516139492b859fa49f1805a49e110d834b813))
* **risk:** add selfCrossEnabled config toggle ([#380](https://github.com/milesburton/veta-trading-platform/issues/380)) ([0ffcf53](https://github.com/milesburton/veta-trading-platform/commit/0ffcf5374f5ec49471c201b771ae4c7276ed3ff5))
* **security:** tag loadgen-driven auth_failure / ws_rate_limited so alerts filter the noise ([#355](https://github.com/milesburton/veta-trading-platform/issues/355)) ([4476e4c](https://github.com/milesburton/veta-trading-platform/commit/4476e4cf366db08d146abf0beca30ba4b3a7cf05))
* **synthetic-probe:** assert personas load + market feed connected ([#392](https://github.com/milesburton/veta-trading-platform/issues/392)) ([ae8efbb](https://github.com/milesburton/veta-trading-platform/commit/ae8efbbf2ace725e05e195c3d62e8116950063f0))


### Bug Fixes

* **ci:** stop integration tests silently passing when they fail ([#431](https://github.com/milesburton/veta-trading-platform/issues/431)) ([155607b](https://github.com/milesburton/veta-trading-platform/commit/155607b353410006f0e718ab7d0ee9abbfa0d0cf))
* **ci:** test:coverage task had compose-restart-policies in wrong position ([#349](https://github.com/milesburton/veta-trading-platform/issues/349)) ([5b59831](https://github.com/milesburton/veta-trading-platform/commit/5b59831817bb45aeb98a449a215345f31322b11d))
* **compose:** raise Postgres and Redpanda memory limits ([#390](https://github.com/milesburton/veta-trading-platform/issues/390)) ([dc291e6](https://github.com/milesburton/veta-trading-platform/commit/dc291e66c2e54fd21d18d8f84361810f1e90c967))
* **consumers:** use stable Kafka group ids to stop orphan-group lag alerts ([#356](https://github.com/milesburton/veta-trading-platform/issues/356)) ([d8a50b9](https://github.com/milesburton/veta-trading-platform/commit/d8a50b97f6a51cd61533ac678fc92ad8970be6c2))
* **deploy:** require explicit opt-in to enable the loadgen profile ([#410](https://github.com/milesburton/veta-trading-platform/issues/410)) ([237f486](https://github.com/milesburton/veta-trading-platform/commit/237f486eb9d0157740e7cbdb04d90990036061e1))
* **docs:** capture Electron screenshots against a healthy mock stack ([#450](https://github.com/milesburton/veta-trading-platform/issues/450)) ([8ec466e](https://github.com/milesburton/veta-trading-platform/commit/8ec466e524eee56de6710544e8007f7d9c1a2816)), closes [#448](https://github.com/milesburton/veta-trading-platform/issues/448)
* **feature-engine:** batch inserts + guard against overlapping flushes ([#388](https://github.com/milesburton/veta-trading-platform/issues/388)) ([4ed9ee9](https://github.com/milesburton/veta-trading-platform/commit/4ed9ee9f3e0492595bd314322d8966aa49034fce))
* **frontend:** silence StatusBar svg prop warnings ([#403](https://github.com/milesburton/veta-trading-platform/issues/403)) ([801f61b](https://github.com/milesburton/veta-trading-platform/commit/801f61bc07b23d7eb67baa94655473ea9e98d13a))
* **frontend:** stop bug report modal thrashing and promote docs link ([#407](https://github.com/milesburton/veta-trading-platform/issues/407)) ([0c5997b](https://github.com/milesburton/veta-trading-platform/commit/0c5997b72889bb6477e13e7525a1eee51eb1a30a))
* **gateway:** demo-day orders must not be attributed to the admin ([#457](https://github.com/milesburton/veta-trading-platform/issues/457)) ([1e70adc](https://github.com/milesburton/veta-trading-platform/commit/1e70adc82ea40fb9bcc11fde76b092f123a28862))
* **gateway:** remove bias from admin load-test randomness ([#409](https://github.com/milesburton/veta-trading-platform/issues/409)) ([c403074](https://github.com/milesburton/veta-trading-platform/commit/c403074598e28f7296fa5c10439c76275a86e4be))
* **gateway:** replace insecure load-test randomness ([#399](https://github.com/milesburton/veta-trading-platform/issues/399)) ([1100c3c](https://github.com/milesburton/veta-trading-platform/commit/1100c3cd6faf5f82f0e16dfdec68d0d49ef37721))
* **infra:** auto-restart every long-running container + structural guard ([#348](https://github.com/milesburton/veta-trading-platform/issues/348)) ([ac608c6](https://github.com/milesburton/veta-trading-platform/commit/ac608c648b7ffcb3b8b8b879fa5bfd140938ef65))
* **infra:** cap memory on every container + structural guard ([#346](https://github.com/milesburton/veta-trading-platform/issues/346)) ([21a03b1](https://github.com/milesburton/veta-trading-platform/commit/21a03b1019f3b60924907f73f20f2d4ca9b135ab))
* **loadgen:** max-runtime TTL + wait for user-service before token refresh ([#391](https://github.com/milesburton/veta-trading-platform/issues/391)) ([d36ce23](https://github.com/milesburton/veta-trading-platform/commit/d36ce238ab681b9815f08f4a4e42e023c52bc939))
* **market-sim:** diff-encode market.ticks (17x bandwidth cut) ([#344](https://github.com/milesburton/veta-trading-platform/issues/344)) ([a3ecd51](https://github.com/milesburton/veta-trading-platform/commit/a3ecd515d4900822f711758b3e63e4cb9904efea))
* **messaging:** clear handler-timeout timer so it never leaks ([#435](https://github.com/milesburton/veta-trading-platform/issues/435)) ([4a02385](https://github.com/milesburton/veta-trading-platform/commit/4a02385482b31d211d2d6f5fae8e8dacf3b4ac18))
* **observability:** persist Alloy positions.yml + bound retry loop ([#347](https://github.com/milesburton/veta-trading-platform/issues/347)) ([5196c4d](https://github.com/milesburton/veta-trading-platform/commit/5196c4dc7202c80c6848bb79fd6b3583079b1988))
* **observability:** scope Alloy docker discovery to our compose projects ([#363](https://github.com/milesburton/veta-trading-platform/issues/363)) ([54871c3](https://github.com/milesburton/veta-trading-platform/commit/54871c3c0ac6f423ed21114852ce699cd1a4b3ac))
* **observability:** stop Discord noise from Redpanda topic-rate rules ([#342](https://github.com/milesburton/veta-trading-platform/issues/342)) ([6ad71d4](https://github.com/milesburton/veta-trading-platform/commit/6ad71d42b80fbecc411902880fc87971f4494de6))
* **order-ticket:** label the role-lock screen by actual role, not always "Admin" ([#455](https://github.com/milesburton/veta-trading-platform/issues/455)) ([f5beced](https://github.com/milesburton/veta-trading-platform/commit/f5beced5261d41479ba3e044280d889d970ec95d))
* **popout:** hydrate auth into pop-out windows so traders can trade ([#458](https://github.com/milesburton/veta-trading-platform/issues/458)) ([303effa](https://github.com/milesburton/veta-trading-platform/commit/303effa8fc5154ebe0beaa5fb46ca472e3049a1a))
* **probe:** connect market_feed step to /ws/gateway not /ws ([#411](https://github.com/milesburton/veta-trading-platform/issues/411)) ([e392d5c](https://github.com/milesburton/veta-trading-platform/commit/e392d5c69c9da5184a3aa3b6fd5f7b72c17dc944))
* **rbac:** correct default desk and auto-select permitted instrument type ([#462](https://github.com/milesburton/veta-trading-platform/issues/462)) ([dbfb08d](https://github.com/milesburton/veta-trading-platform/commit/dbfb08dc0da180be41d72b8d39962ff1ece7ed22))
* **redpanda:** cap retention on market.features/market.signals + cluster default ([#387](https://github.com/milesburton/veta-trading-platform/issues/387)) ([5140fbd](https://github.com/milesburton/veta-trading-platform/commit/5140fbde07c6c696cf5d62dda05165585d137c9e))
* resolve 7 quality and security issues (cascade compliance, selectedAsset race, prefs debounce, strategy divergence, Mermaid ERD, screenshot test race) ([#466](https://github.com/milesburton/veta-trading-platform/issues/466)) ([6bfdf52](https://github.com/milesburton/veta-trading-platform/commit/6bfdf52e56d5bb97e06b3679232cbb707c1fddce))
* **screenshots:** give derivatives trader correct trading_style for options workspace ([#468](https://github.com/milesburton/veta-trading-platform/issues/468)) ([60066af](https://github.com/milesburton/veta-trading-platform/commit/60066af98aed4d1b9f533dbe7a9c38ad607c1cf4))
* **security:** patch docs/site transitive advisories (vite, dompurify, js-yaml, babel) ([#427](https://github.com/milesburton/veta-trading-platform/issues/427)) ([d3ec280](https://github.com/milesburton/veta-trading-platform/commit/d3ec2800d8b454e2aef14edc72615b254d39c3f6))
* **security:** patch esbuild advisory in docs/site + CodeQL crypto-bias finding ([#417](https://github.com/milesburton/veta-trading-platform/issues/417)) ([17a2c40](https://github.com/milesburton/veta-trading-platform/commit/17a2c4087b8e5900fa2113802e9b63d60ea725d2))
* **security:** patch tmp path-traversal (GHSA-ph9p-34f9-6g65) ([d159dfd](https://github.com/milesburton/veta-trading-platform/commit/d159dfdeee18a6d0628bde16547d7f9f15fbe93b))
* **security:** silence two CodeQL warnings ([#357](https://github.com/milesburton/veta-trading-platform/issues/357)) ([b254e57](https://github.com/milesburton/veta-trading-platform/commit/b254e57c2ebd7ec650313b5d2ebfaad1fbb36439))
* **static-pass:** normalize workflow YAML and restore registration PKCE flow ([#401](https://github.com/milesburton/veta-trading-platform/issues/401)) ([9e100ef](https://github.com/milesburton/veta-trading-platform/commit/9e100ef8322487ef1a8e35f78ab00259009111b9))
* **test:** wait for panel re-render after auth identity in screenshot test ([#467](https://github.com/milesburton/veta-trading-platform/issues/467)) ([a710a74](https://github.com/milesburton/veta-trading-platform/commit/a710a7464ba827d1c3e0e071d2ebe9eb65d49368))
* **ux:** prefs persistence, responsive header, panel scroll ([#459](https://github.com/milesburton/veta-trading-platform/issues/459)) ([7b77538](https://github.com/milesburton/veta-trading-platform/commit/7b775388f710210defb0335e882589c5d307c439))

## [1.52.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.51.0...veta-trading-platform-v1.52.0) (2026-06-23)


### Features

* **algos:** migrate remaining 8 strategies to createTypedConsumer ([#376](https://github.com/milesburton/veta-trading-platform/issues/376)) ([b25701d](https://github.com/milesburton/veta-trading-platform/commit/b25701d8f6c67ab794db2c18d4b726b71f2dc87b))
* **ci:** post CI failures, PR merges, and docs deploys to Discord ([#331](https://github.com/milesburton/veta-trading-platform/issues/331)) ([c884cbf](https://github.com/milesburton/veta-trading-platform/commit/c884cbf8a6feec877d4f437c46a8bfd09432e3d1))
* **db:** guard against destructive migrations (expand/contract) ([#443](https://github.com/milesburton/veta-trading-platform/issues/443)) ([4d25d32](https://github.com/milesburton/veta-trading-platform/commit/4d25d3237fdbdd82b7dd8dd73c5d35e2868cbab5))
* **dx:** panel scaffolding generator + Claude provider for llm-advisory ([#437](https://github.com/milesburton/veta-trading-platform/issues/437)) ([ddba5a2](https://github.com/milesburton/veta-trading-platform/commit/ddba5a24a1bc2bd4292c07b62aa91e165da39da9))
* **frontend:** bug-report icon + modal that posts to gateway ([#300](https://github.com/milesburton/veta-trading-platform/issues/300)) ([e262e52](https://github.com/milesburton/veta-trading-platform/commit/e262e5215fcbb9f32726ffb760c1e0b21ec4dd16))
* **frontend:** Platform Status panel with bug-report submission ([#332](https://github.com/milesburton/veta-trading-platform/issues/332)) ([40bfb14](https://github.com/milesburton/veta-trading-platform/commit/40bfb1435bfb625fc85227279923af3dca8e1e41))
* **gateway:** escalate abuse from frame rate-limit to force-close + user-level backoff ([#350](https://github.com/milesburton/veta-trading-platform/issues/350)) ([a0552a6](https://github.com/milesburton/veta-trading-platform/commit/a0552a687c09d93a06923878d65d05122f71cc8d))
* **gateway:** replace per-minute heartbeat with daily summary + /platform-status endpoint ([#330](https://github.com/milesburton/veta-trading-platform/issues/330)) ([a9c3e3b](https://github.com/milesburton/veta-trading-platform/commit/a9c3e3b18bf46bc50c4883841f6ddf127a2acec9))
* **grid:** interactive column freeze for Order Blotter and Executions ([#460](https://github.com/milesburton/veta-trading-platform/issues/460)) ([c5553ce](https://github.com/milesburton/veta-trading-platform/commit/c5553ceb5e24f6b6ce27d93d90f0b9f6d4d12e67))
* **loadgen:** announce start/stop to Discord so alerts channel knows to disregard ([#354](https://github.com/milesburton/veta-trading-platform/issues/354)) ([b5533f8](https://github.com/milesburton/veta-trading-platform/commit/b5533f88b90c58598cc4c24f4b48d30a54b15370))
* **messaging:** createTypedConsumer + EMS first adopter ([#371](https://github.com/milesburton/veta-trading-platform/issues/371)) ([5cdcbfd](https://github.com/milesburton/veta-trading-platform/commit/5cdcbfd27b83f3c43052c23a1df82f37e2769680))
* **messaging:** migrate subscribeNewsSignals + limit-strategy to createTypedConsumer ([#374](https://github.com/milesburton/veta-trading-platform/issues/374)) ([70ea5e9](https://github.com/milesburton/veta-trading-platform/commit/70ea5e949d3bc798290b958eabd6dff29c390c72))
* **observability:** emit process_memory_usage_bytes from every Deno service ([#345](https://github.com/milesburton/veta-trading-platform/issues/345)) ([f907275](https://github.com/milesburton/veta-trading-platform/commit/f9072751edc28c0ebc7fca06debff31cb5b3b540))
* panel generator, Claude llm-advisory provider, FIX docs + MCP server ([#439](https://github.com/milesburton/veta-trading-platform/issues/439)) ([cab3ae5](https://github.com/milesburton/veta-trading-platform/commit/cab3ae5618259c599acace41c955984cfb6a6397))
* **prefs:** persist all UI state + docs sweep + panel reference fix ([#465](https://github.com/milesburton/veta-trading-platform/issues/465)) ([b040333](https://github.com/milesburton/veta-trading-platform/commit/b040333b5f4d8b0044794906a0b1771ba2675f35))
* **prefs:** persist all UI state and add regulatory audit trail ([#463](https://github.com/milesburton/veta-trading-platform/issues/463)) ([e1497e9](https://github.com/milesburton/veta-trading-platform/commit/e1497e9efecbf74f154f5ca62ed7c5035fbfea51))
* **registration:** require a trader archetype on sign-up ([#393](https://github.com/milesburton/veta-trading-platform/issues/393)) ([c1c5161](https://github.com/milesburton/veta-trading-platform/commit/c1c516139492b859fa49f1805a49e110d834b813))
* **risk:** add selfCrossEnabled config toggle ([#380](https://github.com/milesburton/veta-trading-platform/issues/380)) ([0ffcf53](https://github.com/milesburton/veta-trading-platform/commit/0ffcf5374f5ec49471c201b771ae4c7276ed3ff5))
* **security:** tag loadgen-driven auth_failure / ws_rate_limited so alerts filter the noise ([#355](https://github.com/milesburton/veta-trading-platform/issues/355)) ([4476e4c](https://github.com/milesburton/veta-trading-platform/commit/4476e4cf366db08d146abf0beca30ba4b3a7cf05))
* **synthetic-probe:** assert personas load + market feed connected ([#392](https://github.com/milesburton/veta-trading-platform/issues/392)) ([ae8efbb](https://github.com/milesburton/veta-trading-platform/commit/ae8efbbf2ace725e05e195c3d62e8116950063f0))


### Bug Fixes

* **ci:** stop integration tests silently passing when they fail ([#431](https://github.com/milesburton/veta-trading-platform/issues/431)) ([155607b](https://github.com/milesburton/veta-trading-platform/commit/155607b353410006f0e718ab7d0ee9abbfa0d0cf))
* **ci:** test:coverage task had compose-restart-policies in wrong position ([#349](https://github.com/milesburton/veta-trading-platform/issues/349)) ([5b59831](https://github.com/milesburton/veta-trading-platform/commit/5b59831817bb45aeb98a449a215345f31322b11d))
* **compose:** raise Postgres and Redpanda memory limits ([#390](https://github.com/milesburton/veta-trading-platform/issues/390)) ([dc291e6](https://github.com/milesburton/veta-trading-platform/commit/dc291e66c2e54fd21d18d8f84361810f1e90c967))
* **consumers:** use stable Kafka group ids to stop orphan-group lag alerts ([#356](https://github.com/milesburton/veta-trading-platform/issues/356)) ([d8a50b9](https://github.com/milesburton/veta-trading-platform/commit/d8a50b97f6a51cd61533ac678fc92ad8970be6c2))
* **deploy:** require explicit opt-in to enable the loadgen profile ([#410](https://github.com/milesburton/veta-trading-platform/issues/410)) ([237f486](https://github.com/milesburton/veta-trading-platform/commit/237f486eb9d0157740e7cbdb04d90990036061e1))
* **docs:** capture Electron screenshots against a healthy mock stack ([#450](https://github.com/milesburton/veta-trading-platform/issues/450)) ([8ec466e](https://github.com/milesburton/veta-trading-platform/commit/8ec466e524eee56de6710544e8007f7d9c1a2816)), closes [#448](https://github.com/milesburton/veta-trading-platform/issues/448)
* **feature-engine:** batch inserts + guard against overlapping flushes ([#388](https://github.com/milesburton/veta-trading-platform/issues/388)) ([4ed9ee9](https://github.com/milesburton/veta-trading-platform/commit/4ed9ee9f3e0492595bd314322d8966aa49034fce))
* **frontend:** silence StatusBar svg prop warnings ([#403](https://github.com/milesburton/veta-trading-platform/issues/403)) ([801f61b](https://github.com/milesburton/veta-trading-platform/commit/801f61bc07b23d7eb67baa94655473ea9e98d13a))
* **frontend:** stop bug report modal thrashing and promote docs link ([#407](https://github.com/milesburton/veta-trading-platform/issues/407)) ([0c5997b](https://github.com/milesburton/veta-trading-platform/commit/0c5997b72889bb6477e13e7525a1eee51eb1a30a))
* **gateway:** demo-day orders must not be attributed to the admin ([#457](https://github.com/milesburton/veta-trading-platform/issues/457)) ([1e70adc](https://github.com/milesburton/veta-trading-platform/commit/1e70adc82ea40fb9bcc11fde76b092f123a28862))
* **gateway:** remove bias from admin load-test randomness ([#409](https://github.com/milesburton/veta-trading-platform/issues/409)) ([c403074](https://github.com/milesburton/veta-trading-platform/commit/c403074598e28f7296fa5c10439c76275a86e4be))
* **gateway:** replace insecure load-test randomness ([#399](https://github.com/milesburton/veta-trading-platform/issues/399)) ([1100c3c](https://github.com/milesburton/veta-trading-platform/commit/1100c3cd6faf5f82f0e16dfdec68d0d49ef37721))
* **infra:** auto-restart every long-running container + structural guard ([#348](https://github.com/milesburton/veta-trading-platform/issues/348)) ([ac608c6](https://github.com/milesburton/veta-trading-platform/commit/ac608c648b7ffcb3b8b8b879fa5bfd140938ef65))
* **infra:** cap memory on every container + structural guard ([#346](https://github.com/milesburton/veta-trading-platform/issues/346)) ([21a03b1](https://github.com/milesburton/veta-trading-platform/commit/21a03b1019f3b60924907f73f20f2d4ca9b135ab))
* **loadgen:** max-runtime TTL + wait for user-service before token refresh ([#391](https://github.com/milesburton/veta-trading-platform/issues/391)) ([d36ce23](https://github.com/milesburton/veta-trading-platform/commit/d36ce238ab681b9815f08f4a4e42e023c52bc939))
* **market-sim:** diff-encode market.ticks (17x bandwidth cut) ([#344](https://github.com/milesburton/veta-trading-platform/issues/344)) ([a3ecd51](https://github.com/milesburton/veta-trading-platform/commit/a3ecd515d4900822f711758b3e63e4cb9904efea))
* **messaging:** clear handler-timeout timer so it never leaks ([#435](https://github.com/milesburton/veta-trading-platform/issues/435)) ([4a02385](https://github.com/milesburton/veta-trading-platform/commit/4a02385482b31d211d2d6f5fae8e8dacf3b4ac18))
* **observability:** persist Alloy positions.yml + bound retry loop ([#347](https://github.com/milesburton/veta-trading-platform/issues/347)) ([5196c4d](https://github.com/milesburton/veta-trading-platform/commit/5196c4dc7202c80c6848bb79fd6b3583079b1988))
* **observability:** scope Alloy docker discovery to our compose projects ([#363](https://github.com/milesburton/veta-trading-platform/issues/363)) ([54871c3](https://github.com/milesburton/veta-trading-platform/commit/54871c3c0ac6f423ed21114852ce699cd1a4b3ac))
* **observability:** stop Discord noise from Redpanda topic-rate rules ([#342](https://github.com/milesburton/veta-trading-platform/issues/342)) ([6ad71d4](https://github.com/milesburton/veta-trading-platform/commit/6ad71d42b80fbecc411902880fc87971f4494de6))
* **order-ticket:** label the role-lock screen by actual role, not always "Admin" ([#455](https://github.com/milesburton/veta-trading-platform/issues/455)) ([f5beced](https://github.com/milesburton/veta-trading-platform/commit/f5beced5261d41479ba3e044280d889d970ec95d))
* **popout:** hydrate auth into pop-out windows so traders can trade ([#458](https://github.com/milesburton/veta-trading-platform/issues/458)) ([303effa](https://github.com/milesburton/veta-trading-platform/commit/303effa8fc5154ebe0beaa5fb46ca472e3049a1a))
* **probe:** connect market_feed step to /ws/gateway not /ws ([#411](https://github.com/milesburton/veta-trading-platform/issues/411)) ([e392d5c](https://github.com/milesburton/veta-trading-platform/commit/e392d5c69c9da5184a3aa3b6fd5f7b72c17dc944))
* **rbac:** correct default desk and auto-select permitted instrument type ([#462](https://github.com/milesburton/veta-trading-platform/issues/462)) ([dbfb08d](https://github.com/milesburton/veta-trading-platform/commit/dbfb08dc0da180be41d72b8d39962ff1ece7ed22))
* **redpanda:** cap retention on market.features/market.signals + cluster default ([#387](https://github.com/milesburton/veta-trading-platform/issues/387)) ([5140fbd](https://github.com/milesburton/veta-trading-platform/commit/5140fbde07c6c696cf5d62dda05165585d137c9e))
* resolve 7 quality and security issues (cascade compliance, selectedAsset race, prefs debounce, strategy divergence, Mermaid ERD, screenshot test race) ([#466](https://github.com/milesburton/veta-trading-platform/issues/466)) ([6bfdf52](https://github.com/milesburton/veta-trading-platform/commit/6bfdf52e56d5bb97e06b3679232cbb707c1fddce))
* **screenshots:** give derivatives trader correct trading_style for options workspace ([#468](https://github.com/milesburton/veta-trading-platform/issues/468)) ([60066af](https://github.com/milesburton/veta-trading-platform/commit/60066af98aed4d1b9f533dbe7a9c38ad607c1cf4))
* **security:** patch docs/site transitive advisories (vite, dompurify, js-yaml, babel) ([#427](https://github.com/milesburton/veta-trading-platform/issues/427)) ([d3ec280](https://github.com/milesburton/veta-trading-platform/commit/d3ec2800d8b454e2aef14edc72615b254d39c3f6))
* **security:** patch esbuild advisory in docs/site + CodeQL crypto-bias finding ([#417](https://github.com/milesburton/veta-trading-platform/issues/417)) ([17a2c40](https://github.com/milesburton/veta-trading-platform/commit/17a2c4087b8e5900fa2113802e9b63d60ea725d2))
* **security:** patch tmp path-traversal (GHSA-ph9p-34f9-6g65) ([d159dfd](https://github.com/milesburton/veta-trading-platform/commit/d159dfdeee18a6d0628bde16547d7f9f15fbe93b))
* **security:** silence two CodeQL warnings ([#357](https://github.com/milesburton/veta-trading-platform/issues/357)) ([b254e57](https://github.com/milesburton/veta-trading-platform/commit/b254e57c2ebd7ec650313b5d2ebfaad1fbb36439))
* **static-pass:** normalize workflow YAML and restore registration PKCE flow ([#401](https://github.com/milesburton/veta-trading-platform/issues/401)) ([9e100ef](https://github.com/milesburton/veta-trading-platform/commit/9e100ef8322487ef1a8e35f78ab00259009111b9))
* **test:** wait for panel re-render after auth identity in screenshot test ([#467](https://github.com/milesburton/veta-trading-platform/issues/467)) ([a710a74](https://github.com/milesburton/veta-trading-platform/commit/a710a7464ba827d1c3e0e071d2ebe9eb65d49368))
* **ux:** prefs persistence, responsive header, panel scroll ([#459](https://github.com/milesburton/veta-trading-platform/issues/459)) ([7b77538](https://github.com/milesburton/veta-trading-platform/commit/7b775388f710210defb0335e882589c5d307c439))

## [1.51.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.50.0...veta-trading-platform-v1.51.0) (2026-06-22)


### Features

* **alerts:** attach Grafana panel screenshots to Discord alerts ([#340](https://github.com/milesburton/veta-trading-platform/issues/340)) ([0066418](https://github.com/milesburton/veta-trading-platform/commit/0066418e8338b007c8746641411da00a6cc19ccc))
* **algos:** migrate remaining 8 strategies to createTypedConsumer ([#376](https://github.com/milesburton/veta-trading-platform/issues/376)) ([b25701d](https://github.com/milesburton/veta-trading-platform/commit/b25701d8f6c67ab794db2c18d4b726b71f2dc87b))
* **ci:** post CI failures, PR merges, and docs deploys to Discord ([#331](https://github.com/milesburton/veta-trading-platform/issues/331)) ([c884cbf](https://github.com/milesburton/veta-trading-platform/commit/c884cbf8a6feec877d4f437c46a8bfd09432e3d1))
* **db:** guard against destructive migrations (expand/contract) ([#443](https://github.com/milesburton/veta-trading-platform/issues/443)) ([4d25d32](https://github.com/milesburton/veta-trading-platform/commit/4d25d3237fdbdd82b7dd8dd73c5d35e2868cbab5))
* **dx:** panel scaffolding generator + Claude provider for llm-advisory ([#437](https://github.com/milesburton/veta-trading-platform/issues/437)) ([ddba5a2](https://github.com/milesburton/veta-trading-platform/commit/ddba5a24a1bc2bd4292c07b62aa91e165da39da9))
* **frontend:** bug-report icon + modal that posts to gateway ([#300](https://github.com/milesburton/veta-trading-platform/issues/300)) ([e262e52](https://github.com/milesburton/veta-trading-platform/commit/e262e5215fcbb9f32726ffb760c1e0b21ec4dd16))
* **frontend:** Platform Status panel with bug-report submission ([#332](https://github.com/milesburton/veta-trading-platform/issues/332)) ([40bfb14](https://github.com/milesburton/veta-trading-platform/commit/40bfb1435bfb625fc85227279923af3dca8e1e41))
* **gateway:** escalate abuse from frame rate-limit to force-close + user-level backoff ([#350](https://github.com/milesburton/veta-trading-platform/issues/350)) ([a0552a6](https://github.com/milesburton/veta-trading-platform/commit/a0552a687c09d93a06923878d65d05122f71cc8d))
* **gateway:** replace per-minute heartbeat with daily summary + /platform-status endpoint ([#330](https://github.com/milesburton/veta-trading-platform/issues/330)) ([a9c3e3b](https://github.com/milesburton/veta-trading-platform/commit/a9c3e3b18bf46bc50c4883841f6ddf127a2acec9))
* **grid:** interactive column freeze for Order Blotter and Executions ([#460](https://github.com/milesburton/veta-trading-platform/issues/460)) ([c5553ce](https://github.com/milesburton/veta-trading-platform/commit/c5553ceb5e24f6b6ce27d93d90f0b9f6d4d12e67))
* **loadgen:** announce start/stop to Discord so alerts channel knows to disregard ([#354](https://github.com/milesburton/veta-trading-platform/issues/354)) ([b5533f8](https://github.com/milesburton/veta-trading-platform/commit/b5533f88b90c58598cc4c24f4b48d30a54b15370))
* **messaging:** createTypedConsumer + EMS first adopter ([#371](https://github.com/milesburton/veta-trading-platform/issues/371)) ([5cdcbfd](https://github.com/milesburton/veta-trading-platform/commit/5cdcbfd27b83f3c43052c23a1df82f37e2769680))
* **messaging:** migrate subscribeNewsSignals + limit-strategy to createTypedConsumer ([#374](https://github.com/milesburton/veta-trading-platform/issues/374)) ([70ea5e9](https://github.com/milesburton/veta-trading-platform/commit/70ea5e949d3bc798290b958eabd6dff29c390c72))
* **observability:** emit process_memory_usage_bytes from every Deno service ([#345](https://github.com/milesburton/veta-trading-platform/issues/345)) ([f907275](https://github.com/milesburton/veta-trading-platform/commit/f9072751edc28c0ebc7fca06debff31cb5b3b540))
* panel generator, Claude llm-advisory provider, FIX docs + MCP server ([#439](https://github.com/milesburton/veta-trading-platform/issues/439)) ([cab3ae5](https://github.com/milesburton/veta-trading-platform/commit/cab3ae5618259c599acace41c955984cfb6a6397))
* **prefs:** persist all UI state + docs sweep + panel reference fix ([#465](https://github.com/milesburton/veta-trading-platform/issues/465)) ([b040333](https://github.com/milesburton/veta-trading-platform/commit/b040333b5f4d8b0044794906a0b1771ba2675f35))
* **prefs:** persist all UI state and add regulatory audit trail ([#463](https://github.com/milesburton/veta-trading-platform/issues/463)) ([e1497e9](https://github.com/milesburton/veta-trading-platform/commit/e1497e9efecbf74f154f5ca62ed7c5035fbfea51))
* **registration:** require a trader archetype on sign-up ([#393](https://github.com/milesburton/veta-trading-platform/issues/393)) ([c1c5161](https://github.com/milesburton/veta-trading-platform/commit/c1c516139492b859fa49f1805a49e110d834b813))
* **risk:** add selfCrossEnabled config toggle ([#380](https://github.com/milesburton/veta-trading-platform/issues/380)) ([0ffcf53](https://github.com/milesburton/veta-trading-platform/commit/0ffcf5374f5ec49471c201b771ae4c7276ed3ff5))
* **security:** tag loadgen-driven auth_failure / ws_rate_limited so alerts filter the noise ([#355](https://github.com/milesburton/veta-trading-platform/issues/355)) ([4476e4c](https://github.com/milesburton/veta-trading-platform/commit/4476e4cf366db08d146abf0beca30ba4b3a7cf05))
* **synthetic-probe:** assert personas load + market feed connected ([#392](https://github.com/milesburton/veta-trading-platform/issues/392)) ([ae8efbb](https://github.com/milesburton/veta-trading-platform/commit/ae8efbbf2ace725e05e195c3d62e8116950063f0))


### Bug Fixes

* **ci:** stop integration tests silently passing when they fail ([#431](https://github.com/milesburton/veta-trading-platform/issues/431)) ([155607b](https://github.com/milesburton/veta-trading-platform/commit/155607b353410006f0e718ab7d0ee9abbfa0d0cf))
* **ci:** test:coverage task had compose-restart-policies in wrong position ([#349](https://github.com/milesburton/veta-trading-platform/issues/349)) ([5b59831](https://github.com/milesburton/veta-trading-platform/commit/5b59831817bb45aeb98a449a215345f31322b11d))
* **compose:** raise Postgres and Redpanda memory limits ([#390](https://github.com/milesburton/veta-trading-platform/issues/390)) ([dc291e6](https://github.com/milesburton/veta-trading-platform/commit/dc291e66c2e54fd21d18d8f84361810f1e90c967))
* **consumers:** use stable Kafka group ids to stop orphan-group lag alerts ([#356](https://github.com/milesburton/veta-trading-platform/issues/356)) ([d8a50b9](https://github.com/milesburton/veta-trading-platform/commit/d8a50b97f6a51cd61533ac678fc92ad8970be6c2))
* **deploy:** require explicit opt-in to enable the loadgen profile ([#410](https://github.com/milesburton/veta-trading-platform/issues/410)) ([237f486](https://github.com/milesburton/veta-trading-platform/commit/237f486eb9d0157740e7cbdb04d90990036061e1))
* **docs:** capture Electron screenshots against a healthy mock stack ([#450](https://github.com/milesburton/veta-trading-platform/issues/450)) ([8ec466e](https://github.com/milesburton/veta-trading-platform/commit/8ec466e524eee56de6710544e8007f7d9c1a2816)), closes [#448](https://github.com/milesburton/veta-trading-platform/issues/448)
* **feature-engine:** batch inserts + guard against overlapping flushes ([#388](https://github.com/milesburton/veta-trading-platform/issues/388)) ([4ed9ee9](https://github.com/milesburton/veta-trading-platform/commit/4ed9ee9f3e0492595bd314322d8966aa49034fce))
* **frontend:** silence StatusBar svg prop warnings ([#403](https://github.com/milesburton/veta-trading-platform/issues/403)) ([801f61b](https://github.com/milesburton/veta-trading-platform/commit/801f61bc07b23d7eb67baa94655473ea9e98d13a))
* **frontend:** stop bug report modal thrashing and promote docs link ([#407](https://github.com/milesburton/veta-trading-platform/issues/407)) ([0c5997b](https://github.com/milesburton/veta-trading-platform/commit/0c5997b72889bb6477e13e7525a1eee51eb1a30a))
* **gateway:** demo-day orders must not be attributed to the admin ([#457](https://github.com/milesburton/veta-trading-platform/issues/457)) ([1e70adc](https://github.com/milesburton/veta-trading-platform/commit/1e70adc82ea40fb9bcc11fde76b092f123a28862))
* **gateway:** remove bias from admin load-test randomness ([#409](https://github.com/milesburton/veta-trading-platform/issues/409)) ([c403074](https://github.com/milesburton/veta-trading-platform/commit/c403074598e28f7296fa5c10439c76275a86e4be))
* **gateway:** replace insecure load-test randomness ([#399](https://github.com/milesburton/veta-trading-platform/issues/399)) ([1100c3c](https://github.com/milesburton/veta-trading-platform/commit/1100c3cd6faf5f82f0e16dfdec68d0d49ef37721))
* **infra:** auto-restart every long-running container + structural guard ([#348](https://github.com/milesburton/veta-trading-platform/issues/348)) ([ac608c6](https://github.com/milesburton/veta-trading-platform/commit/ac608c648b7ffcb3b8b8b879fa5bfd140938ef65))
* **infra:** cap memory on every container + structural guard ([#346](https://github.com/milesburton/veta-trading-platform/issues/346)) ([21a03b1](https://github.com/milesburton/veta-trading-platform/commit/21a03b1019f3b60924907f73f20f2d4ca9b135ab))
* **loadgen:** max-runtime TTL + wait for user-service before token refresh ([#391](https://github.com/milesburton/veta-trading-platform/issues/391)) ([d36ce23](https://github.com/milesburton/veta-trading-platform/commit/d36ce238ab681b9815f08f4a4e42e023c52bc939))
* **market-sim:** diff-encode market.ticks (17x bandwidth cut) ([#344](https://github.com/milesburton/veta-trading-platform/issues/344)) ([a3ecd51](https://github.com/milesburton/veta-trading-platform/commit/a3ecd515d4900822f711758b3e63e4cb9904efea))
* **messaging:** clear handler-timeout timer so it never leaks ([#435](https://github.com/milesburton/veta-trading-platform/issues/435)) ([4a02385](https://github.com/milesburton/veta-trading-platform/commit/4a02385482b31d211d2d6f5fae8e8dacf3b4ac18))
* **observability:** persist Alloy positions.yml + bound retry loop ([#347](https://github.com/milesburton/veta-trading-platform/issues/347)) ([5196c4d](https://github.com/milesburton/veta-trading-platform/commit/5196c4dc7202c80c6848bb79fd6b3583079b1988))
* **observability:** scope Alloy docker discovery to our compose projects ([#363](https://github.com/milesburton/veta-trading-platform/issues/363)) ([54871c3](https://github.com/milesburton/veta-trading-platform/commit/54871c3c0ac6f423ed21114852ce699cd1a4b3ac))
* **observability:** stop Discord noise from Redpanda topic-rate rules ([#342](https://github.com/milesburton/veta-trading-platform/issues/342)) ([6ad71d4](https://github.com/milesburton/veta-trading-platform/commit/6ad71d42b80fbecc411902880fc87971f4494de6))
* **order-ticket:** label the role-lock screen by actual role, not always "Admin" ([#455](https://github.com/milesburton/veta-trading-platform/issues/455)) ([f5beced](https://github.com/milesburton/veta-trading-platform/commit/f5beced5261d41479ba3e044280d889d970ec95d))
* **popout:** hydrate auth into pop-out windows so traders can trade ([#458](https://github.com/milesburton/veta-trading-platform/issues/458)) ([303effa](https://github.com/milesburton/veta-trading-platform/commit/303effa8fc5154ebe0beaa5fb46ca472e3049a1a))
* **probe:** connect market_feed step to /ws/gateway not /ws ([#411](https://github.com/milesburton/veta-trading-platform/issues/411)) ([e392d5c](https://github.com/milesburton/veta-trading-platform/commit/e392d5c69c9da5184a3aa3b6fd5f7b72c17dc944))
* **rbac:** correct default desk and auto-select permitted instrument type ([#462](https://github.com/milesburton/veta-trading-platform/issues/462)) ([dbfb08d](https://github.com/milesburton/veta-trading-platform/commit/dbfb08dc0da180be41d72b8d39962ff1ece7ed22))
* **redpanda:** cap retention on market.features/market.signals + cluster default ([#387](https://github.com/milesburton/veta-trading-platform/issues/387)) ([5140fbd](https://github.com/milesburton/veta-trading-platform/commit/5140fbde07c6c696cf5d62dda05165585d137c9e))
* resolve 7 quality and security issues (cascade compliance, selectedAsset race, prefs debounce, strategy divergence, Mermaid ERD, screenshot test race) ([#466](https://github.com/milesburton/veta-trading-platform/issues/466)) ([6bfdf52](https://github.com/milesburton/veta-trading-platform/commit/6bfdf52e56d5bb97e06b3679232cbb707c1fddce))
* **screenshots:** give derivatives trader correct trading_style for options workspace ([#468](https://github.com/milesburton/veta-trading-platform/issues/468)) ([60066af](https://github.com/milesburton/veta-trading-platform/commit/60066af98aed4d1b9f533dbe7a9c38ad607c1cf4))
* **security:** patch docs/site transitive advisories (vite, dompurify, js-yaml, babel) ([#427](https://github.com/milesburton/veta-trading-platform/issues/427)) ([d3ec280](https://github.com/milesburton/veta-trading-platform/commit/d3ec2800d8b454e2aef14edc72615b254d39c3f6))
* **security:** patch esbuild advisory in docs/site + CodeQL crypto-bias finding ([#417](https://github.com/milesburton/veta-trading-platform/issues/417)) ([17a2c40](https://github.com/milesburton/veta-trading-platform/commit/17a2c4087b8e5900fa2113802e9b63d60ea725d2))
* **security:** patch tmp path-traversal (GHSA-ph9p-34f9-6g65) ([d159dfd](https://github.com/milesburton/veta-trading-platform/commit/d159dfdeee18a6d0628bde16547d7f9f15fbe93b))
* **security:** silence two CodeQL warnings ([#357](https://github.com/milesburton/veta-trading-platform/issues/357)) ([b254e57](https://github.com/milesburton/veta-trading-platform/commit/b254e57c2ebd7ec650313b5d2ebfaad1fbb36439))
* **static-pass:** normalize workflow YAML and restore registration PKCE flow ([#401](https://github.com/milesburton/veta-trading-platform/issues/401)) ([9e100ef](https://github.com/milesburton/veta-trading-platform/commit/9e100ef8322487ef1a8e35f78ab00259009111b9))
* **test:** wait for panel re-render after auth identity in screenshot test ([#467](https://github.com/milesburton/veta-trading-platform/issues/467)) ([a710a74](https://github.com/milesburton/veta-trading-platform/commit/a710a7464ba827d1c3e0e071d2ebe9eb65d49368))
* **ux:** prefs persistence, responsive header, panel scroll ([#459](https://github.com/milesburton/veta-trading-platform/issues/459)) ([7b77538](https://github.com/milesburton/veta-trading-platform/commit/7b775388f710210defb0335e882589c5d307c439))

## [1.50.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.49.0...veta-trading-platform-v1.50.0) (2026-06-21)


### Features

* **alerts:** attach Grafana panel screenshots to Discord alerts ([#340](https://github.com/milesburton/veta-trading-platform/issues/340)) ([0066418](https://github.com/milesburton/veta-trading-platform/commit/0066418e8338b007c8746641411da00a6cc19ccc))
* **algos:** migrate remaining 8 strategies to createTypedConsumer ([#376](https://github.com/milesburton/veta-trading-platform/issues/376)) ([b25701d](https://github.com/milesburton/veta-trading-platform/commit/b25701d8f6c67ab794db2c18d4b726b71f2dc87b))
* **ci:** post CI failures, PR merges, and docs deploys to Discord ([#331](https://github.com/milesburton/veta-trading-platform/issues/331)) ([c884cbf](https://github.com/milesburton/veta-trading-platform/commit/c884cbf8a6feec877d4f437c46a8bfd09432e3d1))
* **db:** guard against destructive migrations (expand/contract) ([#443](https://github.com/milesburton/veta-trading-platform/issues/443)) ([4d25d32](https://github.com/milesburton/veta-trading-platform/commit/4d25d3237fdbdd82b7dd8dd73c5d35e2868cbab5))
* **dx:** panel scaffolding generator + Claude provider for llm-advisory ([#437](https://github.com/milesburton/veta-trading-platform/issues/437)) ([ddba5a2](https://github.com/milesburton/veta-trading-platform/commit/ddba5a24a1bc2bd4292c07b62aa91e165da39da9))
* **frontend:** bug-report icon + modal that posts to gateway ([#300](https://github.com/milesburton/veta-trading-platform/issues/300)) ([e262e52](https://github.com/milesburton/veta-trading-platform/commit/e262e5215fcbb9f32726ffb760c1e0b21ec4dd16))
* **frontend:** derive SERVICES list from shared/serviceRegistry ([#328](https://github.com/milesburton/veta-trading-platform/issues/328)) ([7105e75](https://github.com/milesburton/veta-trading-platform/commit/7105e75f5a6b450b12bda1095de8c7df2a3c597e))
* **frontend:** Platform Status panel with bug-report submission ([#332](https://github.com/milesburton/veta-trading-platform/issues/332)) ([40bfb14](https://github.com/milesburton/veta-trading-platform/commit/40bfb1435bfb625fc85227279923af3dca8e1e41))
* **gateway:** auto-create GitHub issues from CRITICAL Discord alerts ([#323](https://github.com/milesburton/veta-trading-platform/issues/323)) ([412fa08](https://github.com/milesburton/veta-trading-platform/commit/412fa0826c9d6ad56692f02668df73c66f83dd6a))
* **gateway:** escalate abuse from frame rate-limit to force-close + user-level backoff ([#350](https://github.com/milesburton/veta-trading-platform/issues/350)) ([a0552a6](https://github.com/milesburton/veta-trading-platform/commit/a0552a687c09d93a06923878d65d05122f71cc8d))
* **gateway:** replace per-minute heartbeat with daily summary + /platform-status endpoint ([#330](https://github.com/milesburton/veta-trading-platform/issues/330)) ([a9c3e3b](https://github.com/milesburton/veta-trading-platform/commit/a9c3e3b18bf46bc50c4883841f6ddf127a2acec9))
* **loadgen:** announce start/stop to Discord so alerts channel knows to disregard ([#354](https://github.com/milesburton/veta-trading-platform/issues/354)) ([b5533f8](https://github.com/milesburton/veta-trading-platform/commit/b5533f88b90c58598cc4c24f4b48d30a54b15370))
* **messaging:** createTypedConsumer + EMS first adopter ([#371](https://github.com/milesburton/veta-trading-platform/issues/371)) ([5cdcbfd](https://github.com/milesburton/veta-trading-platform/commit/5cdcbfd27b83f3c43052c23a1df82f37e2769680))
* **messaging:** migrate subscribeNewsSignals + limit-strategy to createTypedConsumer ([#374](https://github.com/milesburton/veta-trading-platform/issues/374)) ([70ea5e9](https://github.com/milesburton/veta-trading-platform/commit/70ea5e949d3bc798290b958eabd6dff29c390c72))
* **observability:** emit process_memory_usage_bytes from every Deno service ([#345](https://github.com/milesburton/veta-trading-platform/issues/345)) ([f907275](https://github.com/milesburton/veta-trading-platform/commit/f9072751edc28c0ebc7fca06debff31cb5b3b540))
* **observability:** scrape Redpanda + alert on topic growth & consumer lag ([#336](https://github.com/milesburton/veta-trading-platform/issues/336)) ([b423865](https://github.com/milesburton/veta-trading-platform/commit/b42386510b7d9d880a10f59eeed3ec834ca81e3a))
* panel generator, Claude llm-advisory provider, FIX docs + MCP server ([#439](https://github.com/milesburton/veta-trading-platform/issues/439)) ([cab3ae5](https://github.com/milesburton/veta-trading-platform/commit/cab3ae5618259c599acace41c955984cfb6a6397))
* **registration:** require a trader archetype on sign-up ([#393](https://github.com/milesburton/veta-trading-platform/issues/393)) ([c1c5161](https://github.com/milesburton/veta-trading-platform/commit/c1c516139492b859fa49f1805a49e110d834b813))
* **registry:** single-source-of-truth for service IDs, ports, compose names ([#327](https://github.com/milesburton/veta-trading-platform/issues/327)) ([6239f35](https://github.com/milesburton/veta-trading-platform/commit/6239f3587878dae610c7d0b02f7540e6fd7b883a))
* **risk:** add selfCrossEnabled config toggle ([#380](https://github.com/milesburton/veta-trading-platform/issues/380)) ([0ffcf53](https://github.com/milesburton/veta-trading-platform/commit/0ffcf5374f5ec49471c201b771ae4c7276ed3ff5))
* **security:** tag loadgen-driven auth_failure / ws_rate_limited so alerts filter the noise ([#355](https://github.com/milesburton/veta-trading-platform/issues/355)) ([4476e4c](https://github.com/milesburton/veta-trading-platform/commit/4476e4cf366db08d146abf0beca30ba4b3a7cf05))
* **synthetic-probe:** assert personas load + market feed connected ([#392](https://github.com/milesburton/veta-trading-platform/issues/392)) ([ae8efbb](https://github.com/milesburton/veta-trading-platform/commit/ae8efbbf2ace725e05e195c3d62e8116950063f0))


### Bug Fixes

* **ci:** align check-clean-state Node to v24 like the rest of CI ([#325](https://github.com/milesburton/veta-trading-platform/issues/325)) ([d2e74cc](https://github.com/milesburton/veta-trading-platform/commit/d2e74ccef3132c41b5a5e4277b214b922db3730c))
* **ci:** stop integration tests silently passing when they fail ([#431](https://github.com/milesburton/veta-trading-platform/issues/431)) ([155607b](https://github.com/milesburton/veta-trading-platform/commit/155607b353410006f0e718ab7d0ee9abbfa0d0cf))
* **ci:** test:coverage task had compose-restart-policies in wrong position ([#349](https://github.com/milesburton/veta-trading-platform/issues/349)) ([5b59831](https://github.com/milesburton/veta-trading-platform/commit/5b59831817bb45aeb98a449a215345f31322b11d))
* **compose:** raise Postgres and Redpanda memory limits ([#390](https://github.com/milesburton/veta-trading-platform/issues/390)) ([dc291e6](https://github.com/milesburton/veta-trading-platform/commit/dc291e66c2e54fd21d18d8f84361810f1e90c967))
* **consumers:** use stable Kafka group ids to stop orphan-group lag alerts ([#356](https://github.com/milesburton/veta-trading-platform/issues/356)) ([d8a50b9](https://github.com/milesburton/veta-trading-platform/commit/d8a50b97f6a51cd61533ac678fc92ad8970be6c2))
* **deploy:** require explicit opt-in to enable the loadgen profile ([#410](https://github.com/milesburton/veta-trading-platform/issues/410)) ([237f486](https://github.com/milesburton/veta-trading-platform/commit/237f486eb9d0157740e7cbdb04d90990036061e1))
* **docs:** capture Electron screenshots against a healthy mock stack ([#450](https://github.com/milesburton/veta-trading-platform/issues/450)) ([8ec466e](https://github.com/milesburton/veta-trading-platform/commit/8ec466e524eee56de6710544e8007f7d9c1a2816)), closes [#448](https://github.com/milesburton/veta-trading-platform/issues/448)
* **docs:** drop generatedAt from panel-reference.json ([#326](https://github.com/milesburton/veta-trading-platform/issues/326)) ([2bfc71c](https://github.com/milesburton/veta-trading-platform/commit/2bfc71c1ef4762840da7cbfa5a974c4dfabbc64e))
* **docs:** resolve script paths in CI so service-map generator doesn't drift ([#341](https://github.com/milesburton/veta-trading-platform/issues/341)) ([1dbd81f](https://github.com/milesburton/veta-trading-platform/commit/1dbd81ff59a7695fd61ceea1b4ae3b76ddea9266))
* **feature-engine:** batch inserts + guard against overlapping flushes ([#388](https://github.com/milesburton/veta-trading-platform/issues/388)) ([4ed9ee9](https://github.com/milesburton/veta-trading-platform/commit/4ed9ee9f3e0492595bd314322d8966aa49034fce))
* **frontend:** add 11 missing services to health panel; refactor hook fanout ([#322](https://github.com/milesburton/veta-trading-platform/issues/322)) ([7d79a7d](https://github.com/milesburton/veta-trading-platform/commit/7d79a7da172f251fa8981a36109a60f2219834b3))
* **frontend:** silence StatusBar svg prop warnings ([#403](https://github.com/milesburton/veta-trading-platform/issues/403)) ([801f61b](https://github.com/milesburton/veta-trading-platform/commit/801f61bc07b23d7eb67baa94655473ea9e98d13a))
* **frontend:** stop bug report modal thrashing and promote docs link ([#407](https://github.com/milesburton/veta-trading-platform/issues/407)) ([0c5997b](https://github.com/milesburton/veta-trading-platform/commit/0c5997b72889bb6477e13e7525a1eee51eb1a30a))
* **gateway:** add missing SVC_PROXY entries for product-service + replay-service ([#329](https://github.com/milesburton/veta-trading-platform/issues/329)) ([71419fc](https://github.com/milesburton/veta-trading-platform/commit/71419fca41af7172529c5e0539a9c6685d73e914))
* **gateway:** demo-day orders must not be attributed to the admin ([#457](https://github.com/milesburton/veta-trading-platform/issues/457)) ([1e70adc](https://github.com/milesburton/veta-trading-platform/commit/1e70adc82ea40fb9bcc11fde76b092f123a28862))
* **gateway:** remove bias from admin load-test randomness ([#409](https://github.com/milesburton/veta-trading-platform/issues/409)) ([c403074](https://github.com/milesburton/veta-trading-platform/commit/c403074598e28f7296fa5c10439c76275a86e4be))
* **gateway:** replace insecure load-test randomness ([#399](https://github.com/milesburton/veta-trading-platform/issues/399)) ([1100c3c](https://github.com/milesburton/veta-trading-platform/commit/1100c3cd6faf5f82f0e16dfdec68d0d49ef37721))
* **homelab-deploy:** widen bind-mount drift check beyond observability ([#337](https://github.com/milesburton/veta-trading-platform/issues/337)) ([84e3d36](https://github.com/milesburton/veta-trading-platform/commit/84e3d365704f8a6a7ea2e63d66c077363ac817f3))
* **infra:** auto-restart every long-running container + structural guard ([#348](https://github.com/milesburton/veta-trading-platform/issues/348)) ([ac608c6](https://github.com/milesburton/veta-trading-platform/commit/ac608c648b7ffcb3b8b8b879fa5bfd140938ef65))
* **infra:** cap memory on every container + structural guard ([#346](https://github.com/milesburton/veta-trading-platform/issues/346)) ([21a03b1](https://github.com/milesburton/veta-trading-platform/commit/21a03b1019f3b60924907f73f20f2d4ca9b135ab))
* **loadgen:** max-runtime TTL + wait for user-service before token refresh ([#391](https://github.com/milesburton/veta-trading-platform/issues/391)) ([d36ce23](https://github.com/milesburton/veta-trading-platform/commit/d36ce238ab681b9815f08f4a4e42e023c52bc939))
* **market-sim:** diff-encode market.ticks (17x bandwidth cut) ([#344](https://github.com/milesburton/veta-trading-platform/issues/344)) ([a3ecd51](https://github.com/milesburton/veta-trading-platform/commit/a3ecd515d4900822f711758b3e63e4cb9904efea))
* **messaging:** clear handler-timeout timer so it never leaks ([#435](https://github.com/milesburton/veta-trading-platform/issues/435)) ([4a02385](https://github.com/milesburton/veta-trading-platform/commit/4a02385482b31d211d2d6f5fae8e8dacf3b4ac18))
* **observability:** persist Alloy positions.yml + bound retry loop ([#347](https://github.com/milesburton/veta-trading-platform/issues/347)) ([5196c4d](https://github.com/milesburton/veta-trading-platform/commit/5196c4dc7202c80c6848bb79fd6b3583079b1988))
* **observability:** scope Alloy docker discovery to our compose projects ([#363](https://github.com/milesburton/veta-trading-platform/issues/363)) ([54871c3](https://github.com/milesburton/veta-trading-platform/commit/54871c3c0ac6f423ed21114852ce699cd1a4b3ac))
* **observability:** stop Discord noise from Redpanda topic-rate rules ([#342](https://github.com/milesburton/veta-trading-platform/issues/342)) ([6ad71d4](https://github.com/milesburton/veta-trading-platform/commit/6ad71d42b80fbecc411902880fc87971f4494de6))
* **observability:** wire Grafana Discord routing for all alert rules ([#338](https://github.com/milesburton/veta-trading-platform/issues/338)) ([934c9ca](https://github.com/milesburton/veta-trading-platform/commit/934c9ca80c1de49a17bd32e2085bcac3ca195eed))
* **order-ticket:** label the role-lock screen by actual role, not always "Admin" ([#455](https://github.com/milesburton/veta-trading-platform/issues/455)) ([f5beced](https://github.com/milesburton/veta-trading-platform/commit/f5beced5261d41479ba3e044280d889d970ec95d))
* **popout:** hydrate auth into pop-out windows so traders can trade ([#458](https://github.com/milesburton/veta-trading-platform/issues/458)) ([303effa](https://github.com/milesburton/veta-trading-platform/commit/303effa8fc5154ebe0beaa5fb46ca472e3049a1a))
* **probe:** connect market_feed step to /ws/gateway not /ws ([#411](https://github.com/milesburton/veta-trading-platform/issues/411)) ([e392d5c](https://github.com/milesburton/veta-trading-platform/commit/e392d5c69c9da5184a3aa3b6fd5f7b72c17dc944))
* **redpanda:** cap retention on market.features/market.signals + cluster default ([#387](https://github.com/milesburton/veta-trading-platform/issues/387)) ([5140fbd](https://github.com/milesburton/veta-trading-platform/commit/5140fbde07c6c696cf5d62dda05165585d137c9e))
* **security:** patch docs/site transitive advisories (vite, dompurify, js-yaml, babel) ([#427](https://github.com/milesburton/veta-trading-platform/issues/427)) ([d3ec280](https://github.com/milesburton/veta-trading-platform/commit/d3ec2800d8b454e2aef14edc72615b254d39c3f6))
* **security:** patch esbuild advisory in docs/site + CodeQL crypto-bias finding ([#417](https://github.com/milesburton/veta-trading-platform/issues/417)) ([17a2c40](https://github.com/milesburton/veta-trading-platform/commit/17a2c4087b8e5900fa2113802e9b63d60ea725d2))
* **security:** patch tmp path-traversal (GHSA-ph9p-34f9-6g65) ([d159dfd](https://github.com/milesburton/veta-trading-platform/commit/d159dfdeee18a6d0628bde16547d7f9f15fbe93b))
* **security:** silence two CodeQL warnings ([#357](https://github.com/milesburton/veta-trading-platform/issues/357)) ([b254e57](https://github.com/milesburton/veta-trading-platform/commit/b254e57c2ebd7ec650313b5d2ebfaad1fbb36439))
* **static-pass:** normalize workflow YAML and restore registration PKCE flow ([#401](https://github.com/milesburton/veta-trading-platform/issues/401)) ([9e100ef](https://github.com/milesburton/veta-trading-platform/commit/9e100ef8322487ef1a8e35f78ab00259009111b9))
* **ux:** prefs persistence, responsive header, panel scroll ([#459](https://github.com/milesburton/veta-trading-platform/issues/459)) ([7b77538](https://github.com/milesburton/veta-trading-platform/commit/7b775388f710210defb0335e882589c5d307c439))

## [1.49.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.48.1...veta-trading-platform-v1.49.0) (2026-06-19)


### Features

* **alerts:** attach Grafana panel screenshots to Discord alerts ([#340](https://github.com/milesburton/veta-trading-platform/issues/340)) ([0066418](https://github.com/milesburton/veta-trading-platform/commit/0066418e8338b007c8746641411da00a6cc19ccc))
* **algos:** migrate remaining 8 strategies to createTypedConsumer ([#376](https://github.com/milesburton/veta-trading-platform/issues/376)) ([b25701d](https://github.com/milesburton/veta-trading-platform/commit/b25701d8f6c67ab794db2c18d4b726b71f2dc87b))
* **ci:** post CI failures, PR merges, and docs deploys to Discord ([#331](https://github.com/milesburton/veta-trading-platform/issues/331)) ([c884cbf](https://github.com/milesburton/veta-trading-platform/commit/c884cbf8a6feec877d4f437c46a8bfd09432e3d1))
* **db:** guard against destructive migrations (expand/contract) ([#443](https://github.com/milesburton/veta-trading-platform/issues/443)) ([4d25d32](https://github.com/milesburton/veta-trading-platform/commit/4d25d3237fdbdd82b7dd8dd73c5d35e2868cbab5))
* **docs:** block PRs that ship stale generated docs ([#320](https://github.com/milesburton/veta-trading-platform/issues/320)) ([9ec44e3](https://github.com/milesburton/veta-trading-platform/commit/9ec44e3466988c9b3c02bbf1c188379197ecff0c))
* **dx:** panel scaffolding generator + Claude provider for llm-advisory ([#437](https://github.com/milesburton/veta-trading-platform/issues/437)) ([ddba5a2](https://github.com/milesburton/veta-trading-platform/commit/ddba5a24a1bc2bd4292c07b62aa91e165da39da9))
* **frontend:** bug-report icon + modal that posts to gateway ([#300](https://github.com/milesburton/veta-trading-platform/issues/300)) ([e262e52](https://github.com/milesburton/veta-trading-platform/commit/e262e5215fcbb9f32726ffb760c1e0b21ec4dd16))
* **frontend:** derive SERVICES list from shared/serviceRegistry ([#328](https://github.com/milesburton/veta-trading-platform/issues/328)) ([7105e75](https://github.com/milesburton/veta-trading-platform/commit/7105e75f5a6b450b12bda1095de8c7df2a3c597e))
* **frontend:** Platform Status panel with bug-report submission ([#332](https://github.com/milesburton/veta-trading-platform/issues/332)) ([40bfb14](https://github.com/milesburton/veta-trading-platform/commit/40bfb1435bfb625fc85227279923af3dca8e1e41))
* **gateway:** auto-create GitHub issues from CRITICAL Discord alerts ([#323](https://github.com/milesburton/veta-trading-platform/issues/323)) ([412fa08](https://github.com/milesburton/veta-trading-platform/commit/412fa0826c9d6ad56692f02668df73c66f83dd6a))
* **gateway:** escalate abuse from frame rate-limit to force-close + user-level backoff ([#350](https://github.com/milesburton/veta-trading-platform/issues/350)) ([a0552a6](https://github.com/milesburton/veta-trading-platform/commit/a0552a687c09d93a06923878d65d05122f71cc8d))
* **gateway:** replace per-minute heartbeat with daily summary + /platform-status endpoint ([#330](https://github.com/milesburton/veta-trading-platform/issues/330)) ([a9c3e3b](https://github.com/milesburton/veta-trading-platform/commit/a9c3e3b18bf46bc50c4883841f6ddf127a2acec9))
* **homelab-deploy:** docker image prune -f after successful deploy ([#317](https://github.com/milesburton/veta-trading-platform/issues/317)) ([be3020d](https://github.com/milesburton/veta-trading-platform/commit/be3020d8f8efb6eb19afc9603cbe1eae906cd7c5))
* **loadgen:** announce start/stop to Discord so alerts channel knows to disregard ([#354](https://github.com/milesburton/veta-trading-platform/issues/354)) ([b5533f8](https://github.com/milesburton/veta-trading-platform/commit/b5533f88b90c58598cc4c24f4b48d30a54b15370))
* **messaging:** createTypedConsumer + EMS first adopter ([#371](https://github.com/milesburton/veta-trading-platform/issues/371)) ([5cdcbfd](https://github.com/milesburton/veta-trading-platform/commit/5cdcbfd27b83f3c43052c23a1df82f37e2769680))
* **messaging:** migrate subscribeNewsSignals + limit-strategy to createTypedConsumer ([#374](https://github.com/milesburton/veta-trading-platform/issues/374)) ([70ea5e9](https://github.com/milesburton/veta-trading-platform/commit/70ea5e949d3bc798290b958eabd6dff29c390c72))
* **observability:** emit process_memory_usage_bytes from every Deno service ([#345](https://github.com/milesburton/veta-trading-platform/issues/345)) ([f907275](https://github.com/milesburton/veta-trading-platform/commit/f9072751edc28c0ebc7fca06debff31cb5b3b540))
* **observability:** frontend heap OTEL gauge + Prometheus alerts ([#318](https://github.com/milesburton/veta-trading-platform/issues/318)) ([3d00d93](https://github.com/milesburton/veta-trading-platform/commit/3d00d938e798cbc62a0d301f3529a1f4d7a0f0f3))
* **observability:** scrape Redpanda + alert on topic growth & consumer lag ([#336](https://github.com/milesburton/veta-trading-platform/issues/336)) ([b423865](https://github.com/milesburton/veta-trading-platform/commit/b42386510b7d9d880a10f59eeed3ec834ca81e3a))
* panel generator, Claude llm-advisory provider, FIX docs + MCP server ([#439](https://github.com/milesburton/veta-trading-platform/issues/439)) ([cab3ae5](https://github.com/milesburton/veta-trading-platform/commit/cab3ae5618259c599acace41c955984cfb6a6397))
* **registration:** require a trader archetype on sign-up ([#393](https://github.com/milesburton/veta-trading-platform/issues/393)) ([c1c5161](https://github.com/milesburton/veta-trading-platform/commit/c1c516139492b859fa49f1805a49e110d834b813))
* **registry:** single-source-of-truth for service IDs, ports, compose names ([#327](https://github.com/milesburton/veta-trading-platform/issues/327)) ([6239f35](https://github.com/milesburton/veta-trading-platform/commit/6239f3587878dae610c7d0b02f7540e6fd7b883a))
* **risk:** add selfCrossEnabled config toggle ([#380](https://github.com/milesburton/veta-trading-platform/issues/380)) ([0ffcf53](https://github.com/milesburton/veta-trading-platform/commit/0ffcf5374f5ec49471c201b771ae4c7276ed3ff5))
* **security:** tag loadgen-driven auth_failure / ws_rate_limited so alerts filter the noise ([#355](https://github.com/milesburton/veta-trading-platform/issues/355)) ([4476e4c](https://github.com/milesburton/veta-trading-platform/commit/4476e4cf366db08d146abf0beca30ba4b3a7cf05))
* **synthetic-probe:** assert personas load + market feed connected ([#392](https://github.com/milesburton/veta-trading-platform/issues/392)) ([ae8efbb](https://github.com/milesburton/veta-trading-platform/commit/ae8efbbf2ace725e05e195c3d62e8116950063f0))


### Bug Fixes

* **ci:** align check-clean-state Node to v24 like the rest of CI ([#325](https://github.com/milesburton/veta-trading-platform/issues/325)) ([d2e74cc](https://github.com/milesburton/veta-trading-platform/commit/d2e74ccef3132c41b5a5e4277b214b922db3730c))
* **ci:** stop integration tests silently passing when they fail ([#431](https://github.com/milesburton/veta-trading-platform/issues/431)) ([155607b](https://github.com/milesburton/veta-trading-platform/commit/155607b353410006f0e718ab7d0ee9abbfa0d0cf))
* **ci:** test:coverage task had compose-restart-policies in wrong position ([#349](https://github.com/milesburton/veta-trading-platform/issues/349)) ([5b59831](https://github.com/milesburton/veta-trading-platform/commit/5b59831817bb45aeb98a449a215345f31322b11d))
* **compose:** raise Postgres and Redpanda memory limits ([#390](https://github.com/milesburton/veta-trading-platform/issues/390)) ([dc291e6](https://github.com/milesburton/veta-trading-platform/commit/dc291e66c2e54fd21d18d8f84361810f1e90c967))
* **consumers:** use stable Kafka group ids to stop orphan-group lag alerts ([#356](https://github.com/milesburton/veta-trading-platform/issues/356)) ([d8a50b9](https://github.com/milesburton/veta-trading-platform/commit/d8a50b97f6a51cd61533ac678fc92ad8970be6c2))
* **deploy:** require explicit opt-in to enable the loadgen profile ([#410](https://github.com/milesburton/veta-trading-platform/issues/410)) ([237f486](https://github.com/milesburton/veta-trading-platform/commit/237f486eb9d0157740e7cbdb04d90990036061e1))
* **docs:** capture Electron screenshots against a healthy mock stack ([#450](https://github.com/milesburton/veta-trading-platform/issues/450)) ([8ec466e](https://github.com/milesburton/veta-trading-platform/commit/8ec466e524eee56de6710544e8007f7d9c1a2816)), closes [#448](https://github.com/milesburton/veta-trading-platform/issues/448)
* **docs:** drop generatedAt from panel-reference.json ([#326](https://github.com/milesburton/veta-trading-platform/issues/326)) ([2bfc71c](https://github.com/milesburton/veta-trading-platform/commit/2bfc71c1ef4762840da7cbfa5a974c4dfabbc64e))
* **docs:** resolve script paths in CI so service-map generator doesn't drift ([#341](https://github.com/milesburton/veta-trading-platform/issues/341)) ([1dbd81f](https://github.com/milesburton/veta-trading-platform/commit/1dbd81ff59a7695fd61ceea1b4ae3b76ddea9266))
* **feature-engine:** batch inserts + guard against overlapping flushes ([#388](https://github.com/milesburton/veta-trading-platform/issues/388)) ([4ed9ee9](https://github.com/milesburton/veta-trading-platform/commit/4ed9ee9f3e0492595bd314322d8966aa49034fce))
* **frontend:** add 11 missing services to health panel; refactor hook fanout ([#322](https://github.com/milesburton/veta-trading-platform/issues/322)) ([7d79a7d](https://github.com/milesburton/veta-trading-platform/commit/7d79a7da172f251fa8981a36109a60f2219834b3))
* **frontend:** silence StatusBar svg prop warnings ([#403](https://github.com/milesburton/veta-trading-platform/issues/403)) ([801f61b](https://github.com/milesburton/veta-trading-platform/commit/801f61bc07b23d7eb67baa94655473ea9e98d13a))
* **frontend:** stop bug report modal thrashing and promote docs link ([#407](https://github.com/milesburton/veta-trading-platform/issues/407)) ([0c5997b](https://github.com/milesburton/veta-trading-platform/commit/0c5997b72889bb6477e13e7525a1eee51eb1a30a))
* **gateway:** add missing PRODUCT_SERVICE_HOST + make doc timestamps stable ([#321](https://github.com/milesburton/veta-trading-platform/issues/321)) ([2ab65a9](https://github.com/milesburton/veta-trading-platform/commit/2ab65a91b9de848f7c758ebc2ae3795381496fd2))
* **gateway:** add missing SVC_PROXY entries for product-service + replay-service ([#329](https://github.com/milesburton/veta-trading-platform/issues/329)) ([71419fc](https://github.com/milesburton/veta-trading-platform/commit/71419fca41af7172529c5e0539a9c6685d73e914))
* **gateway:** remove bias from admin load-test randomness ([#409](https://github.com/milesburton/veta-trading-platform/issues/409)) ([c403074](https://github.com/milesburton/veta-trading-platform/commit/c403074598e28f7296fa5c10439c76275a86e4be))
* **gateway:** replace insecure load-test randomness ([#399](https://github.com/milesburton/veta-trading-platform/issues/399)) ([1100c3c](https://github.com/milesburton/veta-trading-platform/commit/1100c3cd6faf5f82f0e16dfdec68d0d49ef37721))
* **homelab-deploy:** widen bind-mount drift check beyond observability ([#337](https://github.com/milesburton/veta-trading-platform/issues/337)) ([84e3d36](https://github.com/milesburton/veta-trading-platform/commit/84e3d365704f8a6a7ea2e63d66c077363ac817f3))
* **infra:** auto-restart every long-running container + structural guard ([#348](https://github.com/milesburton/veta-trading-platform/issues/348)) ([ac608c6](https://github.com/milesburton/veta-trading-platform/commit/ac608c648b7ffcb3b8b8b879fa5bfd140938ef65))
* **infra:** cap memory on every container + structural guard ([#346](https://github.com/milesburton/veta-trading-platform/issues/346)) ([21a03b1](https://github.com/milesburton/veta-trading-platform/commit/21a03b1019f3b60924907f73f20f2d4ca9b135ab))
* **llm-advisory:** cap orchestrator staleness-refresh query concurrency ([#316](https://github.com/milesburton/veta-trading-platform/issues/316)) ([6974dad](https://github.com/milesburton/veta-trading-platform/commit/6974dadc9ec37743f809ee71b75e49fad395e6f6))
* **llm-advisory:** wrap all 15 JobStore methods in withPgRetry ([#315](https://github.com/milesburton/veta-trading-platform/issues/315)) ([34aa4b1](https://github.com/milesburton/veta-trading-platform/commit/34aa4b1f87986574005488ce17b090ac6fc2a352))
* **loadgen:** max-runtime TTL + wait for user-service before token refresh ([#391](https://github.com/milesburton/veta-trading-platform/issues/391)) ([d36ce23](https://github.com/milesburton/veta-trading-platform/commit/d36ce238ab681b9815f08f4a4e42e023c52bc939))
* **loadgen:** randomise /load-test selectors so 1-order calls vary ([#312](https://github.com/milesburton/veta-trading-platform/issues/312)) ([cfc0d02](https://github.com/milesburton/veta-trading-platform/commit/cfc0d0252bd3ba685dafd17a0efed53ce331cab7))
* **market-sim:** diff-encode market.ticks (17x bandwidth cut) ([#344](https://github.com/milesburton/veta-trading-platform/issues/344)) ([a3ecd51](https://github.com/milesburton/veta-trading-platform/commit/a3ecd515d4900822f711758b3e63e4cb9904efea))
* **messaging:** clear handler-timeout timer so it never leaks ([#435](https://github.com/milesburton/veta-trading-platform/issues/435)) ([4a02385](https://github.com/milesburton/veta-trading-platform/commit/4a02385482b31d211d2d6f5fae8e8dacf3b4ac18))
* **observability:** persist Alloy positions.yml + bound retry loop ([#347](https://github.com/milesburton/veta-trading-platform/issues/347)) ([5196c4d](https://github.com/milesburton/veta-trading-platform/commit/5196c4dc7202c80c6848bb79fd6b3583079b1988))
* **observability:** scope Alloy docker discovery to our compose projects ([#363](https://github.com/milesburton/veta-trading-platform/issues/363)) ([54871c3](https://github.com/milesburton/veta-trading-platform/commit/54871c3c0ac6f423ed21114852ce699cd1a4b3ac))
* **observability:** stop Discord noise from Redpanda topic-rate rules ([#342](https://github.com/milesburton/veta-trading-platform/issues/342)) ([6ad71d4](https://github.com/milesburton/veta-trading-platform/commit/6ad71d42b80fbecc411902880fc87971f4494de6))
* **observability:** wire Grafana Discord routing for all alert rules ([#338](https://github.com/milesburton/veta-trading-platform/issues/338)) ([934c9ca](https://github.com/milesburton/veta-trading-platform/commit/934c9ca80c1de49a17bd32e2085bcac3ca195eed))
* **order-ticket:** label the role-lock screen by actual role, not always "Admin" ([#455](https://github.com/milesburton/veta-trading-platform/issues/455)) ([f5beced](https://github.com/milesburton/veta-trading-platform/commit/f5beced5261d41479ba3e044280d889d970ec95d))
* **probe:** connect market_feed step to /ws/gateway not /ws ([#411](https://github.com/milesburton/veta-trading-platform/issues/411)) ([e392d5c](https://github.com/milesburton/veta-trading-platform/commit/e392d5c69c9da5184a3aa3b6fd5f7b72c17dc944))
* **redpanda:** cap retention on market.features/market.signals + cluster default ([#387](https://github.com/milesburton/veta-trading-platform/issues/387)) ([5140fbd](https://github.com/milesburton/veta-trading-platform/commit/5140fbde07c6c696cf5d62dda05165585d137c9e))
* **security:** patch docs/site transitive advisories (vite, dompurify, js-yaml, babel) ([#427](https://github.com/milesburton/veta-trading-platform/issues/427)) ([d3ec280](https://github.com/milesburton/veta-trading-platform/commit/d3ec2800d8b454e2aef14edc72615b254d39c3f6))
* **security:** patch esbuild advisory in docs/site + CodeQL crypto-bias finding ([#417](https://github.com/milesburton/veta-trading-platform/issues/417)) ([17a2c40](https://github.com/milesburton/veta-trading-platform/commit/17a2c4087b8e5900fa2113802e9b63d60ea725d2))
* **security:** patch tmp path-traversal (GHSA-ph9p-34f9-6g65) ([d159dfd](https://github.com/milesburton/veta-trading-platform/commit/d159dfdeee18a6d0628bde16547d7f9f15fbe93b))
* **security:** silence two CodeQL warnings ([#357](https://github.com/milesburton/veta-trading-platform/issues/357)) ([b254e57](https://github.com/milesburton/veta-trading-platform/commit/b254e57c2ebd7ec650313b5d2ebfaad1fbb36439))
* **static-pass:** normalize workflow YAML and restore registration PKCE flow ([#401](https://github.com/milesburton/veta-trading-platform/issues/401)) ([9e100ef](https://github.com/milesburton/veta-trading-platform/commit/9e100ef8322487ef1a8e35f78ab00259009111b9))

## [1.48.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.48.0...veta-trading-platform-v1.48.1) (2026-06-19)


### Bug Fixes

* **docs:** capture Electron screenshots against a healthy mock stack ([#450](https://github.com/milesburton/veta-trading-platform/issues/450)) ([8ec466e](https://github.com/milesburton/veta-trading-platform/commit/8ec466e524eee56de6710544e8007f7d9c1a2816)), closes [#448](https://github.com/milesburton/veta-trading-platform/issues/448)

## [1.48.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.47.0...veta-trading-platform-v1.48.0) (2026-06-18)


### Features

* **db:** guard against destructive migrations (expand/contract) ([#443](https://github.com/milesburton/veta-trading-platform/issues/443)) ([4d25d32](https://github.com/milesburton/veta-trading-platform/commit/4d25d3237fdbdd82b7dd8dd73c5d35e2868cbab5))

## [1.47.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.7...veta-trading-platform-v1.47.0) (2026-06-18)


### Features

* **dx:** panel scaffolding generator + Claude provider for llm-advisory ([#437](https://github.com/milesburton/veta-trading-platform/issues/437)) ([ddba5a2](https://github.com/milesburton/veta-trading-platform/commit/ddba5a24a1bc2bd4292c07b62aa91e165da39da9))
* panel generator, Claude llm-advisory provider, FIX docs + MCP server ([#439](https://github.com/milesburton/veta-trading-platform/issues/439)) ([cab3ae5](https://github.com/milesburton/veta-trading-platform/commit/cab3ae5618259c599acace41c955984cfb6a6397))

## [1.46.7](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.6...veta-trading-platform-v1.46.7) (2026-06-16)


### Bug Fixes

* **messaging:** clear handler-timeout timer so it never leaks ([#435](https://github.com/milesburton/veta-trading-platform/issues/435)) ([4a02385](https://github.com/milesburton/veta-trading-platform/commit/4a02385482b31d211d2d6f5fae8e8dacf3b4ac18))

## [1.46.6](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.5...veta-trading-platform-v1.46.6) (2026-06-16)


### Bug Fixes

* **ci:** stop integration tests silently passing when they fail ([#431](https://github.com/milesburton/veta-trading-platform/issues/431)) ([155607b](https://github.com/milesburton/veta-trading-platform/commit/155607b353410006f0e718ab7d0ee9abbfa0d0cf))

## [1.46.5](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.4...veta-trading-platform-v1.46.5) (2026-06-15)


### Bug Fixes

* **security:** patch docs/site transitive advisories (vite, dompurify, js-yaml, babel) ([#427](https://github.com/milesburton/veta-trading-platform/issues/427)) ([d3ec280](https://github.com/milesburton/veta-trading-platform/commit/d3ec2800d8b454e2aef14edc72615b254d39c3f6))

## [1.46.4](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.3...veta-trading-platform-v1.46.4) (2026-06-14)


### Bug Fixes

* **security:** patch esbuild advisory in docs/site + CodeQL crypto-bias finding ([#417](https://github.com/milesburton/veta-trading-platform/issues/417)) ([17a2c40](https://github.com/milesburton/veta-trading-platform/commit/17a2c4087b8e5900fa2113802e9b63d60ea725d2))

## [1.46.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.2...veta-trading-platform-v1.46.3) (2026-06-14)


### Bug Fixes

* **deploy:** require explicit opt-in to enable the loadgen profile ([#410](https://github.com/milesburton/veta-trading-platform/issues/410)) ([237f486](https://github.com/milesburton/veta-trading-platform/commit/237f486eb9d0157740e7cbdb04d90990036061e1))
* **probe:** connect market_feed step to /ws/gateway not /ws ([#411](https://github.com/milesburton/veta-trading-platform/issues/411)) ([e392d5c](https://github.com/milesburton/veta-trading-platform/commit/e392d5c69c9da5184a3aa3b6fd5f7b72c17dc944))

## [1.46.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.1...veta-trading-platform-v1.46.2) (2026-06-09)


### Bug Fixes

* **frontend:** silence StatusBar svg prop warnings ([#403](https://github.com/milesburton/veta-trading-platform/issues/403)) ([801f61b](https://github.com/milesburton/veta-trading-platform/commit/801f61bc07b23d7eb67baa94655473ea9e98d13a))
* **frontend:** stop bug report modal thrashing and promote docs link ([#407](https://github.com/milesburton/veta-trading-platform/issues/407)) ([0c5997b](https://github.com/milesburton/veta-trading-platform/commit/0c5997b72889bb6477e13e7525a1eee51eb1a30a))
* **gateway:** remove bias from admin load-test randomness ([#409](https://github.com/milesburton/veta-trading-platform/issues/409)) ([c403074](https://github.com/milesburton/veta-trading-platform/commit/c403074598e28f7296fa5c10439c76275a86e4be))
* **static-pass:** normalize workflow YAML and restore registration PKCE flow ([#401](https://github.com/milesburton/veta-trading-platform/issues/401)) ([9e100ef](https://github.com/milesburton/veta-trading-platform/commit/9e100ef8322487ef1a8e35f78ab00259009111b9))

## [1.46.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.46.0...veta-trading-platform-v1.46.1) (2026-06-04)


### Bug Fixes

* **gateway:** replace insecure load-test randomness ([#399](https://github.com/milesburton/veta-trading-platform/issues/399)) ([1100c3c](https://github.com/milesburton/veta-trading-platform/commit/1100c3cd6faf5f82f0e16dfdec68d0d49ef37721))

## [1.46.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.45.0...veta-trading-platform-v1.46.0) (2026-06-03)


### Features

* **registration:** require a trader archetype on sign-up ([#393](https://github.com/milesburton/veta-trading-platform/issues/393)) ([c1c5161](https://github.com/milesburton/veta-trading-platform/commit/c1c516139492b859fa49f1805a49e110d834b813))
* **synthetic-probe:** assert personas load + market feed connected ([#392](https://github.com/milesburton/veta-trading-platform/issues/392)) ([ae8efbb](https://github.com/milesburton/veta-trading-platform/commit/ae8efbbf2ace725e05e195c3d62e8116950063f0))


### Bug Fixes

* **compose:** raise Postgres and Redpanda memory limits ([#390](https://github.com/milesburton/veta-trading-platform/issues/390)) ([dc291e6](https://github.com/milesburton/veta-trading-platform/commit/dc291e66c2e54fd21d18d8f84361810f1e90c967))
* **feature-engine:** batch inserts + guard against overlapping flushes ([#388](https://github.com/milesburton/veta-trading-platform/issues/388)) ([4ed9ee9](https://github.com/milesburton/veta-trading-platform/commit/4ed9ee9f3e0492595bd314322d8966aa49034fce))
* **loadgen:** max-runtime TTL + wait for user-service before token refresh ([#391](https://github.com/milesburton/veta-trading-platform/issues/391)) ([d36ce23](https://github.com/milesburton/veta-trading-platform/commit/d36ce238ab681b9815f08f4a4e42e023c52bc939))
* **redpanda:** cap retention on market.features/market.signals + cluster default ([#387](https://github.com/milesburton/veta-trading-platform/issues/387)) ([5140fbd](https://github.com/milesburton/veta-trading-platform/commit/5140fbde07c6c696cf5d62dda05165585d137c9e))
* **security:** patch tmp path-traversal (GHSA-ph9p-34f9-6g65) ([d159dfd](https://github.com/milesburton/veta-trading-platform/commit/d159dfdeee18a6d0628bde16547d7f9f15fbe93b))

## [1.45.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.44.0...veta-trading-platform-v1.45.0) (2026-05-26)


### Features

* **risk:** add selfCrossEnabled config toggle ([#380](https://github.com/milesburton/veta-trading-platform/issues/380)) ([0ffcf53](https://github.com/milesburton/veta-trading-platform/commit/0ffcf5374f5ec49471c201b771ae4c7276ed3ff5))

## [1.44.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.43.0...veta-trading-platform-v1.44.0) (2026-05-23)


### Features

* **algos:** migrate remaining 8 strategies to createTypedConsumer ([#376](https://github.com/milesburton/veta-trading-platform/issues/376)) ([b25701d](https://github.com/milesburton/veta-trading-platform/commit/b25701d8f6c67ab794db2c18d4b726b71f2dc87b))
* **messaging:** migrate subscribeNewsSignals + limit-strategy to createTypedConsumer ([#374](https://github.com/milesburton/veta-trading-platform/issues/374)) ([70ea5e9](https://github.com/milesburton/veta-trading-platform/commit/70ea5e949d3bc798290b958eabd6dff29c390c72))

## [1.43.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.42.1...veta-trading-platform-v1.43.0) (2026-05-23)


### Features

* **messaging:** createTypedConsumer + EMS first adopter ([#371](https://github.com/milesburton/veta-trading-platform/issues/371)) ([5cdcbfd](https://github.com/milesburton/veta-trading-platform/commit/5cdcbfd27b83f3c43052c23a1df82f37e2769680))

## [1.42.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.42.0...veta-trading-platform-v1.42.1) (2026-05-23)


### Bug Fixes

* **observability:** scope Alloy docker discovery to our compose projects ([#363](https://github.com/milesburton/veta-trading-platform/issues/363)) ([54871c3](https://github.com/milesburton/veta-trading-platform/commit/54871c3c0ac6f423ed21114852ce699cd1a4b3ac))

## [1.42.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.41.0...veta-trading-platform-v1.42.0) (2026-05-23)


### Features

* **frontend:** bug-report icon + modal that posts to gateway ([#300](https://github.com/milesburton/veta-trading-platform/issues/300)) ([e262e52](https://github.com/milesburton/veta-trading-platform/commit/e262e5215fcbb9f32726ffb760c1e0b21ec4dd16))
* **gateway:** escalate abuse from frame rate-limit to force-close + user-level backoff ([#350](https://github.com/milesburton/veta-trading-platform/issues/350)) ([a0552a6](https://github.com/milesburton/veta-trading-platform/commit/a0552a687c09d93a06923878d65d05122f71cc8d))
* **loadgen:** announce start/stop to Discord so alerts channel knows to disregard ([#354](https://github.com/milesburton/veta-trading-platform/issues/354)) ([b5533f8](https://github.com/milesburton/veta-trading-platform/commit/b5533f88b90c58598cc4c24f4b48d30a54b15370))
* **security:** tag loadgen-driven auth_failure / ws_rate_limited so alerts filter the noise ([#355](https://github.com/milesburton/veta-trading-platform/issues/355)) ([4476e4c](https://github.com/milesburton/veta-trading-platform/commit/4476e4cf366db08d146abf0beca30ba4b3a7cf05))


### Bug Fixes

* **consumers:** use stable Kafka group ids to stop orphan-group lag alerts ([#356](https://github.com/milesburton/veta-trading-platform/issues/356)) ([d8a50b9](https://github.com/milesburton/veta-trading-platform/commit/d8a50b97f6a51cd61533ac678fc92ad8970be6c2))
* **security:** silence two CodeQL warnings ([#357](https://github.com/milesburton/veta-trading-platform/issues/357)) ([b254e57](https://github.com/milesburton/veta-trading-platform/commit/b254e57c2ebd7ec650313b5d2ebfaad1fbb36439))

## [1.41.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.40.0...veta-trading-platform-v1.41.0) (2026-05-21)


### Features

* **alerts:** attach Grafana panel screenshots to Discord alerts ([#340](https://github.com/milesburton/veta-trading-platform/issues/340)) ([0066418](https://github.com/milesburton/veta-trading-platform/commit/0066418e8338b007c8746641411da00a6cc19ccc))
* **auth:** self-service registration with PBKDF2 password storage ([#297](https://github.com/milesburton/veta-trading-platform/issues/297)) ([7406471](https://github.com/milesburton/veta-trading-platform/commit/740647199e1d8f984da98e13e7662f442c2d8de2))
* **ci:** post CI failures, PR merges, and docs deploys to Discord ([#331](https://github.com/milesburton/veta-trading-platform/issues/331)) ([c884cbf](https://github.com/milesburton/veta-trading-platform/commit/c884cbf8a6feec877d4f437c46a8bfd09432e3d1))
* **docs:** block PRs that ship stale generated docs ([#320](https://github.com/milesburton/veta-trading-platform/issues/320)) ([9ec44e3](https://github.com/milesburton/veta-trading-platform/commit/9ec44e3466988c9b3c02bbf1c188379197ecff0c))
* **frontend:** admin-only Observability superset workspace ([#298](https://github.com/milesburton/veta-trading-platform/issues/298)) ([a78f236](https://github.com/milesburton/veta-trading-platform/commit/a78f2362e298f7b5ec32b2ee7add3ff0f7ac9fc0))
* **frontend:** derive SERVICES list from shared/serviceRegistry ([#328](https://github.com/milesburton/veta-trading-platform/issues/328)) ([7105e75](https://github.com/milesburton/veta-trading-platform/commit/7105e75f5a6b450b12bda1095de8c7df2a3c597e))
* **frontend:** Discord link in header next to Grafana/Docs ([#296](https://github.com/milesburton/veta-trading-platform/issues/296)) ([b94f7ae](https://github.com/milesburton/veta-trading-platform/commit/b94f7ae4f81ad3350343e4aae08b28030a371f74))
* **frontend:** Platform Status panel with bug-report submission ([#332](https://github.com/milesburton/veta-trading-platform/issues/332)) ([40bfb14](https://github.com/milesburton/veta-trading-platform/commit/40bfb1435bfb625fc85227279923af3dca8e1e41))
* **gateway:** /bug-report endpoint with dedicated Discord channel ([#299](https://github.com/milesburton/veta-trading-platform/issues/299)) ([36f4334](https://github.com/milesburton/veta-trading-platform/commit/36f4334eba522238b0f99eeb4d36894efae5dcdd))
* **gateway:** auto-create GitHub issues from CRITICAL Discord alerts ([#323](https://github.com/milesburton/veta-trading-platform/issues/323)) ([412fa08](https://github.com/milesburton/veta-trading-platform/commit/412fa0826c9d6ad56692f02668df73c66f83dd6a))
* **gateway:** per-minute Discord status heartbeat with full service rollup ([#319](https://github.com/milesburton/veta-trading-platform/issues/319)) ([f76ca9d](https://github.com/milesburton/veta-trading-platform/commit/f76ca9df80d6559fdc0665ef1925eb87d92a9f9f))
* **gateway:** replace per-minute heartbeat with daily summary + /platform-status endpoint ([#330](https://github.com/milesburton/veta-trading-platform/issues/330)) ([a9c3e3b](https://github.com/milesburton/veta-trading-platform/commit/a9c3e3b18bf46bc50c4883841f6ddf127a2acec9))
* **homelab-deploy:** docker image prune -f after successful deploy ([#317](https://github.com/milesburton/veta-trading-platform/issues/317)) ([be3020d](https://github.com/milesburton/veta-trading-platform/commit/be3020d8f8efb6eb19afc9603cbe1eae906cd7c5))
* **llm-advisory:** inference target configurable so the homelab can use the Spark ([#301](https://github.com/milesburton/veta-trading-platform/issues/301)) ([8ac00b2](https://github.com/milesburton/veta-trading-platform/commit/8ac00b2cfe01825c34b9a15dd40e9c07318a6e51))
* **observability:** emit process_memory_usage_bytes from every Deno service ([#345](https://github.com/milesburton/veta-trading-platform/issues/345)) ([f907275](https://github.com/milesburton/veta-trading-platform/commit/f9072751edc28c0ebc7fca06debff31cb5b3b540))
* **observability:** frontend heap OTEL gauge + Prometheus alerts ([#318](https://github.com/milesburton/veta-trading-platform/issues/318)) ([3d00d93](https://github.com/milesburton/veta-trading-platform/commit/3d00d938e798cbc62a0d301f3529a1f4d7a0f0f3))
* **observability:** scrape Redpanda + alert on topic growth & consumer lag ([#336](https://github.com/milesburton/veta-trading-platform/issues/336)) ([b423865](https://github.com/milesburton/veta-trading-platform/commit/b42386510b7d9d880a10f59eeed3ec834ca81e3a))
* **panel-walkthrough:** role-specific walkthroughs for trader/sales/external-client panels ([#310](https://github.com/milesburton/veta-trading-platform/issues/310)) ([5ab5637](https://github.com/milesburton/veta-trading-platform/commit/5ab5637b872992971cc31f85a39f7c611fc0d812))
* **playbooks:** scaffold AI playbook surfaces (runtime + developer-facing) ([#304](https://github.com/milesburton/veta-trading-platform/issues/304)) ([70881c1](https://github.com/milesburton/veta-trading-platform/commit/70881c1726fb91aa0c8e832ac5d6819bf2b05fcf))
* **registry:** single-source-of-truth for service IDs, ports, compose names ([#327](https://github.com/milesburton/veta-trading-platform/issues/327)) ([6239f35](https://github.com/milesburton/veta-trading-platform/commit/6239f3587878dae610c7d0b02f7540e6fd7b883a))


### Bug Fixes

* **a11y:** clear all axe contrast violations on dashboard scenarios ([#307](https://github.com/milesburton/veta-trading-platform/issues/307)) ([1d37750](https://github.com/milesburton/veta-trading-platform/commit/1d37750df33ba3175ae3128dc8f06098e0c8d6ad))
* **alerts:** Dismiss-all on the drawer closes the drawer ([#293](https://github.com/milesburton/veta-trading-platform/issues/293)) ([2fd1121](https://github.com/milesburton/veta-trading-platform/commit/2fd1121015d73617d47b2a2e12b23e8023a5d6e7))
* **ci:** align check-clean-state Node to v24 like the rest of CI ([#325](https://github.com/milesburton/veta-trading-platform/issues/325)) ([d2e74cc](https://github.com/milesburton/veta-trading-platform/commit/d2e74ccef3132c41b5a5e4277b214b922db3730c))
* **ci:** test:coverage task had compose-restart-policies in wrong position ([#349](https://github.com/milesburton/veta-trading-platform/issues/349)) ([5b59831](https://github.com/milesburton/veta-trading-platform/commit/5b59831817bb45aeb98a449a215345f31322b11d))
* **compose:** llm-advisory + llm-worker auto-restart on crash ([#314](https://github.com/milesburton/veta-trading-platform/issues/314)) ([35397e1](https://github.com/milesburton/veta-trading-platform/commit/35397e17b517133e66a77315e487b586dfb7f9ef))
* **docs:** drop generatedAt from panel-reference.json ([#326](https://github.com/milesburton/veta-trading-platform/issues/326)) ([2bfc71c](https://github.com/milesburton/veta-trading-platform/commit/2bfc71c1ef4762840da7cbfa5a974c4dfabbc64e))
* **docs:** replace homelab/Spark IPs with hostname placeholders ([#311](https://github.com/milesburton/veta-trading-platform/issues/311)) ([0ba7012](https://github.com/milesburton/veta-trading-platform/commit/0ba701263e1b8154fd1df1551340d363a0a624e5))
* **docs:** resolve script paths in CI so service-map generator doesn't drift ([#341](https://github.com/milesburton/veta-trading-platform/issues/341)) ([1dbd81f](https://github.com/milesburton/veta-trading-platform/commit/1dbd81ff59a7695fd61ceea1b4ae3b76ddea9266))
* **frontend:** add 11 missing services to health panel; refactor hook fanout ([#322](https://github.com/milesburton/veta-trading-platform/issues/322)) ([7d79a7d](https://github.com/milesburton/veta-trading-platform/commit/7d79a7da172f251fa8981a36109a60f2219834b3))
* **frontend:** all wall clocks render in UTC with explicit suffix ([#294](https://github.com/milesburton/veta-trading-platform/issues/294)) ([7005559](https://github.com/milesburton/veta-trading-platform/commit/7005559218758877aaf1b34168430aade735cbd9))
* **frontend:** cap advisorySlice.bySymbol at 100 entries with LRU eviction ([#313](https://github.com/milesburton/veta-trading-platform/issues/313)) ([a1d3d9c](https://github.com/milesburton/veta-trading-platform/commit/a1d3d9c768cc93a644eda2979aaa4b65d11686ca))
* **frontend:** commit SHA labelled as commit, linked to GitHub ([#291](https://github.com/milesburton/veta-trading-platform/issues/291)) ([aaf774f](https://github.com/milesburton/veta-trading-platform/commit/aaf774ffe6d71e5e7b759ffd01f3fe340ebb2cda))
* **frontend:** startup overlay derives services from gateway response ([#295](https://github.com/milesburton/veta-trading-platform/issues/295)) ([75d030a](https://github.com/milesburton/veta-trading-platform/commit/75d030acca749f84b36ecef50ba224d33e80cf8d))
* **gateway:** add missing PRODUCT_SERVICE_HOST + make doc timestamps stable ([#321](https://github.com/milesburton/veta-trading-platform/issues/321)) ([2ab65a9](https://github.com/milesburton/veta-trading-platform/commit/2ab65a91b9de848f7c758ebc2ae3795381496fd2))
* **gateway:** add missing SVC_PROXY entries for product-service + replay-service ([#329](https://github.com/milesburton/veta-trading-platform/issues/329)) ([71419fc](https://github.com/milesburton/veta-trading-platform/commit/71419fca41af7172529c5e0539a9c6685d73e914))
* **homelab-deploy:** restart containers when bind-mounted single files drift ([#309](https://github.com/milesburton/veta-trading-platform/issues/309)) ([1be5611](https://github.com/milesburton/veta-trading-platform/commit/1be5611f726f13ec0737e564ff9b0a406f1c4d2f))
* **homelab-deploy:** widen bind-mount drift check beyond observability ([#337](https://github.com/milesburton/veta-trading-platform/issues/337)) ([84e3d36](https://github.com/milesburton/veta-trading-platform/commit/84e3d365704f8a6a7ea2e63d66c077363ac817f3))
* **infra:** auto-restart every long-running container + structural guard ([#348](https://github.com/milesburton/veta-trading-platform/issues/348)) ([ac608c6](https://github.com/milesburton/veta-trading-platform/commit/ac608c648b7ffcb3b8b8b879fa5bfd140938ef65))
* **infra:** cap memory on every container + structural guard ([#346](https://github.com/milesburton/veta-trading-platform/issues/346)) ([21a03b1](https://github.com/milesburton/veta-trading-platform/commit/21a03b1019f3b60924907f73f20f2d4ca9b135ab))
* **llm-advisory:** cap orchestrator staleness-refresh query concurrency ([#316](https://github.com/milesburton/veta-trading-platform/issues/316)) ([6974dad](https://github.com/milesburton/veta-trading-platform/commit/6974dadc9ec37743f809ee71b75e49fad395e6f6))
* **llm-advisory:** wrap all 15 JobStore methods in withPgRetry ([#315](https://github.com/milesburton/veta-trading-platform/issues/315)) ([34aa4b1](https://github.com/milesburton/veta-trading-platform/commit/34aa4b1f87986574005488ce17b090ac6fc2a352))
* **loadgen:** randomise /load-test selectors so 1-order calls vary ([#312](https://github.com/milesburton/veta-trading-platform/issues/312)) ([cfc0d02](https://github.com/milesburton/veta-trading-platform/commit/cfc0d0252bd3ba685dafd17a0efed53ce331cab7))
* **market-sim:** diff-encode market.ticks (17x bandwidth cut) ([#344](https://github.com/milesburton/veta-trading-platform/issues/344)) ([a3ecd51](https://github.com/milesburton/veta-trading-platform/commit/a3ecd515d4900822f711758b3e63e4cb9904efea))
* **observability:** persist Alloy positions.yml + bound retry loop ([#347](https://github.com/milesburton/veta-trading-platform/issues/347)) ([5196c4d](https://github.com/milesburton/veta-trading-platform/commit/5196c4dc7202c80c6848bb79fd6b3583079b1988))
* **observability:** stop Discord noise from Redpanda topic-rate rules ([#342](https://github.com/milesburton/veta-trading-platform/issues/342)) ([6ad71d4](https://github.com/milesburton/veta-trading-platform/commit/6ad71d42b80fbecc411902880fc87971f4494de6))
* **observability:** wire Grafana Discord routing for all alert rules ([#338](https://github.com/milesburton/veta-trading-platform/issues/338)) ([934c9ca](https://github.com/milesburton/veta-trading-platform/commit/934c9ca80c1de49a17bd32e2085bcac3ca195eed))

## [1.40.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.39.2...veta-trading-platform-v1.40.0) (2026-05-18)


### Features

* **alerts:** wire Discord for platform + user-level alerts ([#280](https://github.com/milesburton/veta-trading-platform/issues/280)) ([ad78282](https://github.com/milesburton/veta-trading-platform/commit/ad782825457db0bb5e5922281df0f9474dd2d311))
* **observability:** add memory-growth alert rules ([3164f39](https://github.com/milesburton/veta-trading-platform/commit/3164f39865d0f14ede822d320adf83bc7aa4aeec))
* **observability:** add memory-growth alert rules to Prometheus ([870f64e](https://github.com/milesburton/veta-trading-platform/commit/870f64e513ec3b09bd06328c4c32f991d6f263b2))
* **telemetry:** frontend memory polling + gateway ingestion endpoint ([#279](https://github.com/milesburton/veta-trading-platform/issues/279)) ([e2b8312](https://github.com/milesburton/veta-trading-platform/commit/e2b8312b6375399394569127ce65750d60f5bf88))


### Bug Fixes

* **a11y:** add aria-label to 5 unlabelled symbol/source selects ([#276](https://github.com/milesburton/veta-trading-platform/issues/276)) ([4cfd024](https://github.com/milesburton/veta-trading-platform/commit/4cfd024bdf9e2df0b0b8101264469f4da80f4798))
* **a11y:** bump contrast ratios for failing token colours ([#281](https://github.com/milesburton/veta-trading-platform/issues/281)) ([372c6ad](https://github.com/milesburton/veta-trading-platform/commit/372c6ad4d6ff5d804dc6131a04df8e58e958c0fe))
* **frontend:** give the breaker-expiry janitor a stop handle ([#271](https://github.com/milesburton/veta-trading-platform/issues/271)) ([ae854e2](https://github.com/milesburton/veta-trading-platform/commit/ae854e2e2bc58981ab9d62a13aea9acb3a7d506f))
* **frontend:** Market Data indicator uses avgDays + relaxed threshold ([#272](https://github.com/milesburton/veta-trading-platform/issues/272)) ([ef20045](https://github.com/milesburton/veta-trading-platform/commit/ef200458ced258004a1f07e3d0d0e4da7d72a737))
* **frontend:** tighten gateway WS reconnect backoff after outage ([#267](https://github.com/milesburton/veta-trading-platform/issues/267)) ([19f7871](https://github.com/milesburton/veta-trading-platform/commit/19f78719a6056a1909098159acca152bca08ef30))
* **llm-advisory:** prompt-builder tolerates partial data instead of crashing ([#270](https://github.com/milesburton/veta-trading-platform/issues/270)) ([3fe630f](https://github.com/milesburton/veta-trading-platform/commit/3fe630fa4c6bd82b306a2f832a409c56336804b4))
* **observability:** repair Trading Overview dashboard health signals ([#268](https://github.com/milesburton/veta-trading-platform/issues/268)) ([3fff644](https://github.com/milesburton/veta-trading-platform/commit/3fff64411a4e7bb2e38ad7281a00bf6ac3b721f2))

## [1.39.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.39.1...veta-trading-platform-v1.39.2) (2026-05-18)


### Bug Fixes

* **edge:** sshd ClientAlive on veta-tunnel so the tunnel auto-recovers from outages ([#264](https://github.com/milesburton/veta-trading-platform/issues/264)) ([bac8c79](https://github.com/milesburton/veta-trading-platform/commit/bac8c79e19de362164195057130155709b9a548b))
* **frontend:** header polish — short SHA in services, build date back, hard-reload on logout ([#266](https://github.com/milesburton/veta-trading-platform/issues/266)) ([0586945](https://github.com/milesburton/veta-trading-platform/commit/0586945f39c5cc14cb7c06f24e1f488869c5e064))

## [1.39.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.39.0...veta-trading-platform-v1.39.1) (2026-05-18)


### Bug Fixes

* candlestick seed + Dismiss-all + memory caps + Deno process metrics ([#260](https://github.com/milesburton/veta-trading-platform/issues/260)) ([2fb33cb](https://github.com/milesburton/veta-trading-platform/commit/2fb33cbab66a6ac2aa6f34a26634e28168e8536d))
* **llm-advisory:** four reliability fixes so the AI advisory panel works end-to-end ([#262](https://github.com/milesburton/veta-trading-platform/issues/262)) ([406cbdc](https://github.com/milesburton/veta-trading-platform/commit/406cbdce7c069c88a3d4e1ab1d6a723623bb787f))

## [1.39.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.38.0...veta-trading-platform-v1.39.0) (2026-05-17)


### Features

* **docs:** glossary &lt;Term&gt; + &lt;External&gt; components + alias sweep ([#255](https://github.com/milesburton/veta-trading-platform/issues/255)) ([4f10e85](https://github.com/milesburton/veta-trading-platform/commit/4f10e858a54fca5c52f68328e113d3c31a2b6638))
* **smoke:** port legacy smoke.test.ts to testcontainers, delete dead code ([#249](https://github.com/milesburton/veta-trading-platform/issues/249)) ([7f7ccb0](https://github.com/milesburton/veta-trading-platform/commit/7f7ccb033f27c9168207ca0a292f92cce0c98027))


### Bug Fixes

* **docs-drift:** resolve screenshot refs to canonical committed sources ([#247](https://github.com/milesburton/veta-trading-platform/issues/247)) ([a53dcf8](https://github.com/milesburton/veta-trading-platform/commit/a53dcf8d2659c29131274d6e8e8334e8a7ebcd46))
* **homelab-deploy:** detect foreign-owned files + surface rsync errors ([#257](https://github.com/milesburton/veta-trading-platform/issues/257)) ([3fa305f](https://github.com/milesburton/veta-trading-platform/commit/3fa305f82d9541f7a8b0a0b54d2144c1761251c7))
* observability dashboards + GUI header overlap + formatPrice refactor ([#259](https://github.com/milesburton/veta-trading-platform/issues/259)) ([85c69a2](https://github.com/milesburton/veta-trading-platform/commit/85c69a24a08b42395a01fb7e50c98185d4b9dc43))
* **observability:** Grafana anonymous = Viewer, login form re-enabled ([#254](https://github.com/milesburton/veta-trading-platform/issues/254)) ([ff22c3e](https://github.com/milesburton/veta-trading-platform/commit/ff22c3e39339214a34e388dcf9f24af547248610))
* **observability:** remove Traefik BasicAuth on /grafana/ ([#256](https://github.com/milesburton/veta-trading-platform/issues/256)) ([79276ad](https://github.com/milesburton/veta-trading-platform/commit/79276ada47f70cfdf713343a3faff8ec95012164))

## [1.38.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.37.1...veta-trading-platform-v1.38.0) (2026-05-15)


### Features

* **docs:** auto-generate test inventory + add docs-drift detection tests ([#245](https://github.com/milesburton/veta-trading-platform/issues/245)) ([ae9403b](https://github.com/milesburton/veta-trading-platform/commit/ae9403b735d040196b5d37e45e769ad83d2225d0))
* **gateway+user-service:** public/anonymous trading via /oauth/guest with per-IP rate limit ([#234](https://github.com/milesburton/veta-trading-platform/issues/234)) ([283ad2c](https://github.com/milesburton/veta-trading-platform/commit/283ad2c3de29fde470b54611e40b97b3261b7709))
* **probe:** post-deploy CI mirror + Astro documentation + runbook polish ([#237](https://github.com/milesburton/veta-trading-platform/issues/237)) ([808c4a6](https://github.com/milesburton/veta-trading-platform/commit/808c4a6b3d4bedbb09c76428527660f9a97614d0))
* **synthetic-probe:** external prober on OVH edge + cleanup follow-ups ([#236](https://github.com/milesburton/veta-trading-platform/issues/236)) ([f9afb92](https://github.com/milesburton/veta-trading-platform/commit/f9afb923fe8f68d81b6c0b80e2888c479e0418b9))


### Bug Fixes

* **auto-pull:** pick swarm-deploy.sh vs homelab-deploy.sh based on Swarm mode ([#224](https://github.com/milesburton/veta-trading-platform/issues/224)) ([b10881d](https://github.com/milesburton/veta-trading-platform/commit/b10881df2478f4a788c11e2112adb2a3c340713f))
* **deploy:** include compose.swarm.yml in homelab-deploy.sh sync list ([#229](https://github.com/milesburton/veta-trading-platform/issues/229)) ([8470356](https://github.com/milesburton/veta-trading-platform/commit/84703562571d65576a404072a0952777fe2faa02))
* **devcontainer:** post-start.sh workspace path + husky deprecation + regression test ([#240](https://github.com/milesburton/veta-trading-platform/issues/240)) ([2da2505](https://github.com/milesburton/veta-trading-platform/commit/2da25056ac8b52d19ec4c05838fab85d69f97ab6))
* **docs+app:** cross-link the platform and Grafana from the header ([#241](https://github.com/milesburton/veta-trading-platform/issues/241)) ([555491e](https://github.com/milesburton/veta-trading-platform/commit/555491e477729f8efdfb81c3e6ed7b62b47b493a))
* **docs:** redact private IPs from new Astro pages ([#239](https://github.com/milesburton/veta-trading-platform/issues/239)) ([371ca58](https://github.com/milesburton/veta-trading-platform/commit/371ca58a1b463f353d47162bb5b25d8e393008f5))
* **docs:** remove deleted Watchtower entry from Starlight sidebar ([#231](https://github.com/milesburton/veta-trading-platform/issues/231)) ([a88c966](https://github.com/milesburton/veta-trading-platform/commit/a88c966f18dc26294626a91875ac7225f03ad8a6))
* journal fix-archive hostname + llm-advisory handler timeout ([#228](https://github.com/milesburton/veta-trading-platform/issues/228)) ([0877b15](https://github.com/milesburton/veta-trading-platform/commit/0877b1554b32ff27858a99911f29cb58ec119882))
* **swarm:** use existing veta_trading-net bridge instead of creating an overlay ([#226](https://github.com/milesburton/veta-trading-platform/issues/226)) ([dbfa175](https://github.com/milesburton/veta-trading-platform/commit/dbfa1758e3689382c3ca39b39bf0df5e6b5dce0e))


### Performance Improvements

* **llm-advisory:** in-process cache for runtime-config to remove hot-path DB queries ([#232](https://github.com/milesburton/veta-trading-platform/issues/232)) ([3b780b5](https://github.com/milesburton/veta-trading-platform/commit/3b780b57093ff6b733e8207991d98d36959e777f))

## [1.37.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.37.0...veta-trading-platform-v1.37.1) (2026-05-13)


### Bug Fixes

* **ci:** build frontend with VITE_DEPLOYMENT=prod, not uat ([#220](https://github.com/milesburton/veta-trading-platform/issues/220)) ([8055171](https://github.com/milesburton/veta-trading-platform/commit/8055171c01b6d4be8bf9af4940da8128b42863d3))
* **ci:** probe market-sim/prices directly, not through the gated gateway ([#218](https://github.com/milesburton/veta-trading-platform/issues/218)) ([ca1b6ab](https://github.com/milesburton/veta-trading-platform/commit/ca1b6ab1d3450f8de1ee42e33d4a2971ed6bbe94))
* **compose:** pin trading-net to bare name so Traefik finds it ([#215](https://github.com/milesburton/veta-trading-platform/issues/215)) ([8a6dadb](https://github.com/milesburton/veta-trading-platform/commit/8a6dadb885f0acfb3b9e14aa3b17cf39c8e9cc7a))
* **edge:** restrict OVH-edge TLS ALPN to http/1.1 so WebSocket upgrades work ([#213](https://github.com/milesburton/veta-trading-platform/issues/213)) ([720d10a](https://github.com/milesburton/veta-trading-platform/commit/720d10a8e3958407fcd27e4df608738c291d0049))
* **gate:** authenticate the prices test so it doesn't 401 at the gateway ([#219](https://github.com/milesburton/veta-trading-platform/issues/219)) ([abcef62](https://github.com/milesburton/veta-trading-platform/commit/abcef626bd4a44d3094e079f9406830526e05e2c))
* **gateway:** cache rejected tokens to stop infinite reauth loops ([#221](https://github.com/milesburton/veta-trading-platform/issues/221)) ([69507e0](https://github.com/milesburton/veta-trading-platform/commit/69507e0d3900cbe5f3c64be4b4402dfe66770082))
* **market-data-adapters:** don't block HTTP server boot on initial seed ([#217](https://github.com/milesburton/veta-trading-platform/issues/217)) ([b475497](https://github.com/milesburton/veta-trading-platform/commit/b4754977e3b31e0b94cbc16dd832a9bf5c14362d))
* **observability:** remove grafana-mermaid-panel install, breaks crash loop ([#211](https://github.com/milesburton/veta-trading-platform/issues/211)) ([9539783](https://github.com/milesburton/veta-trading-platform/commit/9539783c1d639bae8db5679825d8318822f65fc8))

## [1.37.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.36.1...veta-trading-platform-v1.37.0) (2026-05-12)


### Features

* **version-watch:** auto-reload anonymous tabs across deploys; faster polling ([#196](https://github.com/milesburton/veta-trading-platform/issues/196)) ([d085b48](https://github.com/milesburton/veta-trading-platform/commit/d085b487a4dc61e0dabd0d0fcd6b988cdfa45bcd))


### Bug Fixes

* **test:** match /api/gateway/api/user-service/sessions/me in GatewayMock ([#197](https://github.com/milesburton/veta-trading-platform/issues/197)) ([fd25bfd](https://github.com/milesburton/veta-trading-platform/commit/fd25bfd84786e5a3c2d9344d513f3d8e35ae1307))
* **ws:** keep recovering instead of giving up; auto-retry on tab focus and online ([#194](https://github.com/milesburton/veta-trading-platform/issues/194)) ([490ead1](https://github.com/milesburton/veta-trading-platform/commit/490ead1d72f132c7407d2b4028c377ebc07ea052))

## [1.36.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.36.0...veta-trading-platform-v1.36.1) (2026-05-11)


### Bug Fixes

* **auth+coverage:** force sign-in for anonymous visitors; lift branch coverage above 80% ([#192](https://github.com/milesburton/veta-trading-platform/issues/192)) ([fcf6227](https://github.com/milesburton/veta-trading-platform/commit/fcf6227f3a7dd0f33f3952ffd0e777720d74e30d))

## [1.36.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.35.0...veta-trading-platform-v1.36.0) (2026-05-11)


### Features

* **login:** one-click persona sign-in + full-width persona browser ([#188](https://github.com/milesburton/veta-trading-platform/issues/188)) ([b960c40](https://github.com/milesburton/veta-trading-platform/commit/b960c40ce4c14cb7a96cf6a5042fd04abc5a03dd))
* **observability:** ship frontend warns/errors to Loki, not just the console ([#191](https://github.com/milesburton/veta-trading-platform/issues/191)) ([b93e049](https://github.com/milesburton/veta-trading-platform/commit/b93e0490ceff33a82f429a58df06a45227c3a23d))


### Bug Fixes

* **ws+auth+login:** connection-loss UX, session-expiry banner, login polish ([#190](https://github.com/milesburton/veta-trading-platform/issues/190)) ([e2dc4af](https://github.com/milesburton/veta-trading-platform/commit/e2dc4af5456db262b490638438071b97a5aff672))

## [1.35.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.34.0...veta-trading-platform-v1.35.0) (2026-05-11)


### Features

* **trade-bar:** LLM fallback via llm-worker /parse-ticket endpoint ([#186](https://github.com/milesburton/veta-trading-platform/issues/186)) ([b1ce1fc](https://github.com/milesburton/veta-trading-platform/commit/b1ce1fc1533d21d32e1f17e5449dffc99d9a3a14))

## [1.34.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.33.0...veta-trading-platform-v1.34.0) (2026-05-11)


### Features

* **trade-bar:** natural-language QuickTradeBar prefilling the OrderTicket ([#184](https://github.com/milesburton/veta-trading-platform/issues/184)) ([fde9fb3](https://github.com/milesburton/veta-trading-platform/commit/fde9fb3bcfd4fde305c109e4fa9406470390a497))

## [1.33.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.32.1...veta-trading-platform-v1.33.0) (2026-05-11)


### Features

* **auth:** public read-only dashboard + fix demo persona picker + blank pop-out ticket ([#180](https://github.com/milesburton/veta-trading-platform/issues/180)) ([3d8e5c5](https://github.com/milesburton/veta-trading-platform/commit/3d8e5c500535702b2c9e982397042bb49e0604da))
* **homelab:** wire OAUTH2_USER_SECRETS env into user-service ([#178](https://github.com/milesburton/veta-trading-platform/issues/178)) ([cab8f1c](https://github.com/milesburton/veta-trading-platform/commit/cab8f1c3b4105613c54987d6493696db28ea3dc4))

## [1.32.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.32.0...veta-trading-platform-v1.32.1) (2026-05-11)


### Bug Fixes

* **docs:** redact LAN IPs from public docs site + add CI guard ([#177](https://github.com/milesburton/veta-trading-platform/issues/177)) ([591e58e](https://github.com/milesburton/veta-trading-platform/commit/591e58eb24987cdeaca4cf9ce7afdf55d8dc2b3f))
* **frontend:** route ALL backend fetches through gateway + redo arch diagram ([#175](https://github.com/milesburton/veta-trading-platform/issues/175)) ([c091979](https://github.com/milesburton/veta-trading-platform/commit/c0919793687cb1f7dcd7034028c13a2110538826))

## [1.32.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.31.1...veta-trading-platform-v1.32.0) (2026-05-11)


### Features

* **coverage:** instrument Testcontainer-spawned services (closes [#148](https://github.com/milesburton/veta-trading-platform/issues/148)) ([#162](https://github.com/milesburton/veta-trading-platform/issues/162)) ([f79e076](https://github.com/milesburton/veta-trading-platform/commit/f79e0762f0012b1d97a3ca4bbf1ab8ac9810ec58))
* **security:** Grafana alert rules for auth_failure + ws_rate_limited spikes (F-11) ([#168](https://github.com/milesburton/veta-trading-platform/issues/168)) ([ec8616f](https://github.com/milesburton/veta-trading-platform/commit/ec8616f870254f913af79accb2cf3f2955eef3d9))


### Bug Fixes

* **compose:** add missing *_HOST envs to gateway for replay, risk-engine, market-data-adapters ([#173](https://github.com/milesburton/veta-trading-platform/issues/173)) ([34ae425](https://github.com/milesburton/veta-trading-platform/commit/34ae4257878ffc9b0faa740b65f7b253c630b3ee))
* **frontend:** route service health probes through gateway SVC_PROXY ([#174](https://github.com/milesburton/veta-trading-platform/issues/174)) ([578baea](https://github.com/milesburton/veta-trading-platform/commit/578baeacd12d1ad369d4813560ebbc4567daef2d))
* **gateway:** SVC_PROXY map ignored *_HOST env, hardcoded localhost ([#172](https://github.com/milesburton/veta-trading-platform/issues/172)) ([4efa63a](https://github.com/milesburton/veta-trading-platform/commit/4efa63a9788c54f0a4d78f70274c312ef086f2bb))
* **security:** allow /api/&lt;svc&gt;/health under SVC_PROXY without auth + dedupe CSP ([#170](https://github.com/milesburton/veta-trading-platform/issues/170)) ([a862942](https://github.com/milesburton/veta-trading-platform/commit/a862942c6c07d1d2f4fe53a45ea859458f1fb69d))
* **security:** CSP, CSRF check, upgrade-status validation, dashboard scope (F-7/F-8/F-12/F-14/F-15/F-16) ([d5d9659](https://github.com/milesburton/veta-trading-platform/commit/d5d9659e59d4df7d1f1cb2e0362f78e7b1846346))
* **security:** CSP, CSRF check, upgrade-status validation, Traefik dashboard scope, doc fixes ([9930c6d](https://github.com/milesburton/veta-trading-platform/commit/9930c6de3702b5449ba98141f978b21fe475d9fb))
* **security:** drop wildcard CORS from shared @veta/http helpers ([#166](https://github.com/milesburton/veta-trading-platform/issues/166)) ([b7676c0](https://github.com/milesburton/veta-trading-platform/commit/b7676c0ccf584765cf7c942c2d163cf77b1f47e7))
* **security:** ensure CSP header actually lands in responses ([#169](https://github.com/milesburton/veta-trading-platform/issues/169)) ([46920c1](https://github.com/milesburton/veta-trading-platform/commit/46920c143efd84f48452353346f459281a979116))
* **security:** revert SERVICES filter change that broke StatusBar tests ([#167](https://github.com/milesburton/veta-trading-platform/issues/167)) ([902ebbe](https://github.com/milesburton/veta-trading-platform/commit/902ebbe9372b98a32e07a11787c6f1ac28de0417))
* **security:** SVC_PROXY default-deny role allowlist (F-17) ([#165](https://github.com/milesburton/veta-trading-platform/issues/165)) ([45c2905](https://github.com/milesburton/veta-trading-platform/commit/45c290592eed78b29cbe8639b081620a323f17ea))
* **security:** tighten CORS, harden cookie, gate public registration (F-3, F-4, F-13) ([#158](https://github.com/milesburton/veta-trading-platform/issues/158)) ([5b8fc3f](https://github.com/milesburton/veta-trading-platform/commit/5b8fc3f68c983758537b95751bc155f6f94087ea))
* **security:** trim unauth detail from /ready and /system (F-9) ([#164](https://github.com/milesburton/veta-trading-platform/issues/164)) ([e1ee1eb](https://github.com/milesburton/veta-trading-platform/commit/e1ee1eb0132a78159ad3c9bd96cbc5e08d94b6d8))
* **security:** WS frame rate-limit + per-user data scoping (F-5, F-6) ([#161](https://github.com/milesburton/veta-trading-platform/issues/161)) ([db5adad](https://github.com/milesburton/veta-trading-platform/commit/db5adad6f90b0de66bb4cc9ef9bddba8af12c374))

## [1.31.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.31.0...veta-trading-platform-v1.31.1) (2026-05-11)


### Bug Fixes

* **security:** close two critical public-exposure findings (F-1, F-2) ([#156](https://github.com/milesburton/veta-trading-platform/issues/156)) ([e580551](https://github.com/milesburton/veta-trading-platform/commit/e580551da3cb4b39cd9027d85c218238af940197))

## [1.31.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.30.0...veta-trading-platform-v1.31.0) (2026-05-11)


### Features

* **infra:** public ingress via OVH edge + autossh reverse tunnel ([#153](https://github.com/milesburton/veta-trading-platform/issues/153)) ([5241f14](https://github.com/milesburton/veta-trading-platform/commit/5241f14a7d9bdbaf82a2157b15c15709c0e03f80))


### Bug Fixes

* **deploy:** recover from Docker recreate race + treat Created as failure ([#155](https://github.com/milesburton/veta-trading-platform/issues/155)) ([8153e88](https://github.com/milesburton/veta-trading-platform/commit/8153e882c505c5f75638c1ff6d98bb9f505b5c57))
* **edge:** make LE cert issue + add Grafana public route ([#154](https://github.com/milesburton/veta-trading-platform/issues/154)) ([0f91413](https://github.com/milesburton/veta-trading-platform/commit/0f914136deff2a2eb8da7a7102249e7b8cbb43b6))
* **homelab:** real TLS via Cloudflare DNS-01 + edge rate-limit ([#151](https://github.com/milesburton/veta-trading-platform/issues/151)) ([4c146b5](https://github.com/milesburton/veta-trading-platform/commit/4c146b5b00e8d936503902ee986ce1f11397cb68))

## [1.30.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.29.0...veta-trading-platform-v1.30.0) (2026-05-10)


### Features

* **deploy:** gateway scale-out + loadgen overlay conditional ([#142](https://github.com/milesburton/veta-trading-platform/issues/142)) ([0a1d475](https://github.com/milesburton/veta-trading-platform/commit/0a1d4752b6c80b80fe49a24b1b32238758ba2e7e))


### Bug Fixes

* **compose:** expose only frontend, gateway, redpanda-console via Traefik ([#144](https://github.com/milesburton/veta-trading-platform/issues/144)) ([5d43d03](https://github.com/milesburton/veta-trading-platform/commit/5d43d031f657d593380c9339f0537a9111cd590d))
* **deploy,compose:** observability overlay + ollama healthcheck + load-gen rsync ([#139](https://github.com/milesburton/veta-trading-platform/issues/139)) ([faca17d](https://github.com/milesburton/veta-trading-platform/commit/faca17d3c50ce0ddd8e4a98b80d086da51e1fd6b))
* **gateway:** require auth on SVC_PROXY catch-all ([#143](https://github.com/milesburton/veta-trading-platform/issues/143)) ([56759a9](https://github.com/milesburton/veta-trading-platform/commit/56759a924b86142bb2c2b69ab1457fdb81c96200))
* **load.sh:** source .env.loadgen for off/status/logs ([#141](https://github.com/milesburton/veta-trading-platform/issues/141)) ([6982123](https://github.com/milesburton/veta-trading-platform/commit/69821230d3399785193d84ba1fb869c2fd90a40c))

## [1.29.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.28.1...veta-trading-platform-v1.29.0) (2026-05-09)


### Features

* continuous load generator with on/off switch ([#129](https://github.com/milesburton/veta-trading-platform/issues/129)) ([2159341](https://github.com/milesburton/veta-trading-platform/commit/2159341d2b07351b88d5f2b552bff5e64ac0757e))


### Bug Fixes

* **deploy:** auto-pull self-updates deploy.sh before running it ([#138](https://github.com/milesburton/veta-trading-platform/issues/138)) ([1638484](https://github.com/milesburton/veta-trading-platform/commit/1638484c16c4009806f15926980779bd0b1f163d))
* **deploy:** tolerate non-critical service failures + correct verification ([#136](https://github.com/milesburton/veta-trading-platform/issues/136)) ([c00bb33](https://github.com/milesburton/veta-trading-platform/commit/c00bb33b0ea42141429fb7ed79aef82b7f21ac2d))
* **feature-engine:** bump V8 heap and container memory to stop OOM crash loop ([#134](https://github.com/milesburton/veta-trading-platform/issues/134)) ([ff4f6ba](https://github.com/milesburton/veta-trading-platform/commit/ff4f6ba833e1ac091c687548d1c241a946d472ef))
* **security,docs:** demo-day admin gate + correct local-dev instructions ([#137](https://github.com/milesburton/veta-trading-platform/issues/137)) ([dc91e2e](https://github.com/milesburton/veta-trading-platform/commit/dc91e2ef15b2cc8292b409449351c69727108036))
* three small correctness issues from session audit ([#131](https://github.com/milesburton/veta-trading-platform/issues/131)) ([21a2b33](https://github.com/milesburton/veta-trading-platform/commit/21a2b3390b6b6846d3d6a1b3bd07b0043d8d5304))

## [1.28.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.28.0...veta-trading-platform-v1.28.1) (2026-05-09)


### Bug Fixes

* **observability:** shorten dashboard windows for real-time visibility ([#126](https://github.com/milesburton/veta-trading-platform/issues/126)) ([0dab052](https://github.com/milesburton/veta-trading-platform/commit/0dab0526cec84c81ba104556330fff56c301ae7d))

## [1.28.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.27.0...veta-trading-platform-v1.28.0) (2026-05-09)


### Features

* **gateway:** token-bucket rate limiting per IP + per user ([#113](https://github.com/milesburton/veta-trading-platform/issues/113)) ([ea1c198](https://github.com/milesburton/veta-trading-platform/commit/ea1c198a2eaaebdc0c663c489764e15bc3285db8))
* **load-gen:** admin/oncall toggleable in-platform load generator ([#120](https://github.com/milesburton/veta-trading-platform/issues/120)) ([47f3258](https://github.com/milesburton/veta-trading-platform/commit/47f3258d2f2d072ab2c68363604dc19c93dc836f))


### Bug Fixes

* **observability:** correct tempo span_metrics_dimensions schema for Tempo 2.7 ([#115](https://github.com/milesburton/veta-trading-platform/issues/115)) ([0ce33ad](https://github.com/milesburton/veta-trading-platform/commit/0ce33ad9c2bd1e6c0118ce6e5fbe85eb31476ae8))
* **observability:** order pipeline dashboard — empty-state guidance + filter health probes ([#118](https://github.com/milesburton/veta-trading-platform/issues/118)) ([b217978](https://github.com/milesburton/veta-trading-platform/commit/b217978fe703a2546f58e089ed79c84e28b2e074))
* **observability:** replace nodeGraph with per-stage throughput row ([#121](https://github.com/milesburton/veta-trading-platform/issues/121)) ([9b47718](https://github.com/milesburton/veta-trading-platform/commit/9b47718b5e8c6c8c7d0bb954d5a5af55897b411b))
* **observability:** wait for downstream readiness before first poll ([#117](https://github.com/milesburton/veta-trading-platform/issues/117)) ([8b4c1d7](https://github.com/milesburton/veta-trading-platform/commit/8b4c1d70279beb24fa7c39a3b7fa16e9685139f4))
* **oms,journal:** cap expire-orphans poll lookback to 6h to drop error rate &lt;1% ([#122](https://github.com/milesburton/veta-trading-platform/issues/122)) ([e8c207d](https://github.com/milesburton/veta-trading-platform/commit/e8c207ddb5341835e0e1b3e320d2094c7bb17f27))
* **oms:** timeout + functional refactor on expire-orphans poll, document live error-rate ([#116](https://github.com/milesburton/veta-trading-platform/issues/116)) ([619e589](https://github.com/milesburton/veta-trading-platform/commit/619e589ffaac58b674cea4e2dc9e6b31b4185abb))
* wire missing service hosts + drop OTel-traced waitFor probes ([#124](https://github.com/milesburton/veta-trading-platform/issues/124)) ([db18cd4](https://github.com/milesburton/veta-trading-platform/commit/db18cd41f81cee1b1f0da389ca1678807e305cda))

## [1.27.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.26.0...veta-trading-platform-v1.27.0) (2026-05-08)


### Features

* **observability:** add order-flow Sankey to pipeline dashboard ([#105](https://github.com/milesburton/veta-trading-platform/issues/105)) ([d538c36](https://github.com/milesburton/veta-trading-platform/commit/d538c362a0815496085d7f8573faba38d0e4d862))
* **rbac:** add oncall role end-to-end ([#108](https://github.com/milesburton/veta-trading-platform/issues/108)) ([2d5204a](https://github.com/milesburton/veta-trading-platform/commit/2d5204a4e8ea58319d3824957100e7523c783356))
* **risk:** bypass-resistance audit + integration test + doc ([#112](https://github.com/milesburton/veta-trading-platform/issues/112)) ([359dc5c](https://github.com/milesburton/veta-trading-platform/commit/359dc5c3d459e847689ef212b214c7f11dfd1a7a))


### Bug Fixes

* **ci:** build PR docker images successfully by always pushing the base ([#97](https://github.com/milesburton/veta-trading-platform/issues/97)) ([4bd8b4b](https://github.com/milesburton/veta-trading-platform/commit/4bd8b4b637fcdc3801a4f2b5254b8d147f4eb5b9))
* **compose:** wire JOURNAL/MARKET_DATA hosts for market-sim ([#102](https://github.com/milesburton/veta-trading-platform/issues/102)) ([839d23e](https://github.com/milesburton/veta-trading-platform/commit/839d23e3abc8986e652af80b9e1c66d764bfbb05))
* **feature-engine:** stop fetching journal on every Kafka tick ([#96](https://github.com/milesburton/veta-trading-platform/issues/96)) ([34620cf](https://github.com/milesburton/veta-trading-platform/commit/34620cf58e47d9dd75054a4eb2e2621db12166ce))
* **observability:** drop error-rate dashboard noise to actuals ([#98](https://github.com/milesburton/veta-trading-platform/issues/98)) ([814ac5a](https://github.com/milesburton/veta-trading-platform/commit/814ac5ad5d0fa864b168502975e29c1d01bf06c1))
* **screenshots:** clean marketing dashboard — drop service-down banner + reject toast ([#107](https://github.com/milesburton/veta-trading-platform/issues/107)) ([5b7a369](https://github.com/milesburton/veta-trading-platform/commit/5b7a369154ef10564aa4205bed72828409c8b00f))


### Performance Improvements

* **ci:** tier 1 build-time reductions (~14min → ~5min target) ([#106](https://github.com/milesburton/veta-trading-platform/issues/106)) ([0ac4034](https://github.com/milesburton/veta-trading-platform/commit/0ac4034678259635ab2dd3986148eb96ea790e2e))

## [1.26.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.25.0...veta-trading-platform-v1.26.0) (2026-05-07)


### Features

* **ui:** consolidate gray scale into purpose-named semantic tokens ([#87](https://github.com/milesburton/veta-trading-platform/issues/87)) ([8bafd9a](https://github.com/milesburton/veta-trading-platform/commit/8bafd9ab4ddf1f54d596c875f42a38fbbdf61576))


### Bug Fixes

* **badges:** correct stale coverage badges that misrepresent the suite ([#82](https://github.com/milesburton/veta-trading-platform/issues/82)) ([45aac12](https://github.com/milesburton/veta-trading-platform/commit/45aac125e36cd408f52a5a68bfdeb226cbb432c1))
* **fly:** bump vm size to shared-cpu-8x to match 12gb memory request ([#83](https://github.com/milesburton/veta-trading-platform/issues/83)) ([1b8c381](https://github.com/milesburton/veta-trading-platform/commit/1b8c381a55f901dcca18e04c91bb463ff582602e))
* **tests:** un-skip 4 algo integration steps with a full-permission trader ([#80](https://github.com/milesburton/veta-trading-platform/issues/80)) ([5d2de6c](https://github.com/milesburton/veta-trading-platform/commit/5d2de6cdb494ece40f92dbc1be30047e6b459dae))

## [1.25.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.24.0...veta-trading-platform-v1.25.0) (2026-05-06)


### Features

* **docs:** dynamic glossary page ([00c4b7e](https://github.com/milesburton/veta-trading-platform/commit/00c4b7ea12bb9fae1b342c9c6419b28c77a5d8b4))
* **frontend:** scenarios panel + RTK Query slice ([b688585](https://github.com/milesburton/veta-trading-platform/commit/b6885851af07a09de955cd8759487fa85f42bb41))
* **market-sim:** seedable PRNG for deterministic price replay ([baeabeb](https://github.com/milesburton/veta-trading-platform/commit/baeabeb438be351c8f98d1db0c30521b29eabd03))
* **observability:** Grafana screenshots + in-app log drawer ([7c19188](https://github.com/milesburton/veta-trading-platform/commit/7c191884852a4ccb583f2e3bbb608405a8b9daf8))
* **observability:** two Grafana dashboards driven by OTel data ([eeb2f89](https://github.com/milesburton/veta-trading-platform/commit/eeb2f8945f57bfaafdafc08c6e5d1ef5e3342d8e))
* **observability:** wire Deno OTel auto-instrumentation across the stack ([e26e929](https://github.com/milesburton/veta-trading-platform/commit/e26e929370e4c85186e4a00380f29026037b4840))
* **risk-engine:** immutable, versioned config history ([10ca65b](https://github.com/milesburton/veta-trading-platform/commit/10ca65b128ed605ff6146360c426c22208287165))
* **scenarios:** orchestrator + gateway routes for repeatable runs ([45a08eb](https://github.com/milesburton/veta-trading-platform/commit/45a08eb1b4b69262bbcdcb0ba6f9565e2160f2e1))
* **scenarios:** persistence layer for repeatable trading scenarios ([3336ca6](https://github.com/milesburton/veta-trading-platform/commit/3336ca6127855225f963717951bee23c8fc04967))


### Bug Fixes

* **compose:** remove duplicate gateway-ws-strip from prod override ([22f032e](https://github.com/milesburton/veta-trading-platform/commit/22f032e5b0c81f823ad450f3b58555622fff8910))
* **compose:** stop stripping /ws/gateway prefix in Traefik ([96a586b](https://github.com/milesburton/veta-trading-platform/commit/96a586b0abdbda345d081b130beeddaf66260570))
* **db,build:** lazy pools + version build-arg threaded through CI ([65b3df5](https://github.com/milesburton/veta-trading-platform/commit/65b3df5db53d5b7e48a38395965d62e7f5d3219a))
* **frontend:** docs link in header + semver build chip without duplicate env pill ([b6358cb](https://github.com/milesburton/veta-trading-platform/commit/b6358cb93b5e8a4f17396c22e8e13f1816cc85c5))
* **frontend:** tone down kill-switch idle red, dedupe startup version, frame header build-info ([0d672e7](https://github.com/milesburton/veta-trading-platform/commit/0d672e74195e534734f3893ec27f4e7ddacc3c4c))
* **observability:** wire Alloy → Tempo correctly + align dashboards with real label keys ([7a5f577](https://github.com/milesburton/veta-trading-platform/commit/7a5f577c56cdd9a3e9513f4bb20e3021c95eecdd))


### Reverts

* **fly:** roll back vm resize — 8gb wasn't enough for the monolith ([ace5a5a](https://github.com/milesburton/veta-trading-platform/commit/ace5a5afc5728ecb6b5d437919036061c3de17e8))

## [1.24.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.23.0...veta-trading-platform-v1.24.0) (2026-05-05)


### Features

* **frontend:** client-side WebM rendering of replay sessions ([85d6d27](https://github.com/milesburton/veta-trading-platform/commit/85d6d27084eb95781d37250302a30ad29e02baa2))
* surface deployment environment in title bar and beside every version ([5cdaed8](https://github.com/milesburton/veta-trading-platform/commit/5cdaed851973fca3a2aaaa9c0b949a2132516f1f))


### Bug Fixes

* **frontend:** match stretched flexlayout tab buttons in Playwright selectors ([bf0acab](https://github.com/milesburton/veta-trading-platform/commit/bf0acab3c4e27074880d1f6e6939937f1bd3e43d))

## [1.23.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.22.6...veta-trading-platform-v1.23.0) (2026-05-04)


### Features

* **a11y:** add tooltip titles across all table headers and form controls ([0fb1afe](https://github.com/milesburton/veta-trading-platform/commit/0fb1afe4e802798f9384c80d9107af2f84e75b83))
* **alerts:** bottom-right toast with prev/next, plus "caused by" context ([56feab0](https://github.com/milesburton/veta-trading-platform/commit/56feab0b00b8fde1817791427d5b33c16f86cc63))
* **alerts:** dedupe alerts within 30s window + bump heartbeat threshold ([f1e9ab1](https://github.com/milesburton/veta-trading-platform/commit/f1e9ab18dc0189cd1031edce4a1e823f22d82325))
* **docs:** click any image to open it full-screen (lightbox) ([07ebade](https://github.com/milesburton/veta-trading-platform/commit/07ebade18035cfc8501566b607a5e38bd8d18c2f))
* **frontend:** hide tab strip on single-tab tabsets, split multi-tab defaults ([ac36320](https://github.com/milesburton/veta-trading-platform/commit/ac36320fc175435c283205f9a9313dd5ca7306b5))
* **frontend:** make update banner dismissable, reassure session is preserved ([78cab6b](https://github.com/milesburton/veta-trading-platform/commit/78cab6ba16acdd21783bdc118e8afa9d68f3bd84))
* **homelab:** wire risk-engine, replay-service, product-service for compose ([789280c](https://github.com/milesburton/veta-trading-platform/commit/789280c7f0814a018ce827a8df0a1e202f45cbab))
* **news:** make the news-feed source link more obvious ([082e808](https://github.com/milesburton/veta-trading-platform/commit/082e808c03097fbb401a3e509c25dd02221bd428))


### Bug Fixes

* **db:** record applied migrations from migrate.ts, not the SQL files ([dc95f00](https://github.com/milesburton/veta-trading-platform/commit/dc95f0042c58f52e59ebad6e845abebf5de9b7e1))
* **docs:** use the candlestick favicon to match the main app ([082e808](https://github.com/milesburton/veta-trading-platform/commit/082e808c03097fbb401a3e509c25dd02221bd428))
* **frontend:** hide Traefik from service health on UAT, only show locally ([5c66fd2](https://github.com/milesburton/veta-trading-platform/commit/5c66fd238fea03c0531107fe43381a9163670516))
* **homelab:** let Watchtower pull and re-run db-migrate on new images ([b2815b8](https://github.com/milesburton/veta-trading-platform/commit/b2815b848c812563c159b74851d8af791372a185))
* **workspaces:** align shared icon color and add button tooltips ([4a7ce69](https://github.com/milesburton/veta-trading-platform/commit/4a7ce693050a669b03781fcc937622f0ea1f1261))

## [1.22.6](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.22.5...veta-trading-platform-v1.22.6) (2026-05-04)


### Bug Fixes

* **docs:** alias react / react-dom / signals-react to docs/site copies ([a5d5b1a](https://github.com/milesburton/veta-trading-platform/commit/a5d5b1a4c5c130a005b7eac76e2c5ae66a61bda3))
* **login:** degraded overlay contrast + stop re-rendering every health poll ([168ad68](https://github.com/milesburton/veta-trading-platform/commit/168ad68c146a55dd957cd36d6b999efd5c62332f))

## [1.22.5](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.22.4...veta-trading-platform-v1.22.5) (2026-05-04)


### Bug Fixes

* **docs:** add @preact/signals-react so Pages deploy can build ([c89541d](https://github.com/milesburton/veta-trading-platform/commit/c89541dad8f31963c04278f1686ff9dac4ef58f4))
* **startup:** restore standalone startup page layout ([44b247e](https://github.com/milesburton/veta-trading-platform/commit/44b247e48879198cec5b3b860611bed1750243f5))

## [1.22.4](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.22.3...veta-trading-platform-v1.22.4) (2026-05-04)


### Bug Fixes

* **docs:** mermaid 11 needs loose securityLevel for HTML labels ([5b40647](https://github.com/milesburton/veta-trading-platform/commit/5b406474f9975dfedf89b390053a567e399dce31))
* **docs:** mermaid follows Starlight theme + re-renders on toggle ([d1f445a](https://github.com/milesburton/veta-trading-platform/commit/d1f445abbc865caac07d1f8fb3273d4a06dd0117))
* **login:** make degraded overlay background fully opaque ([24b00d1](https://github.com/milesburton/veta-trading-platform/commit/24b00d185fff54998e935dd2d92e87435b5aad39))

## [1.22.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.22.2...veta-trading-platform-v1.22.3) (2026-05-04)


### Bug Fixes

* **docs:** make Mermaid parsing robust in architecture page ([75cc226](https://github.com/milesburton/veta-trading-platform/commit/75cc2263c8dc383d42ac778e546931c26d461295))
* **frontend:** restore compact startup overlay footer layout ([ed82f4c](https://github.com/milesburton/veta-trading-platform/commit/ed82f4ca1ba527c278ef4196531a454af3cbe0a1))

## [1.22.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.22.1...veta-trading-platform-v1.22.2) (2026-05-04)


### Bug Fixes

* ems test now exercises production code; lint script no longer runs tests ([bec7bf7](https://github.com/milesburton/veta-trading-platform/commit/bec7bf789d6af8132d5281973e6c11adbed2cac5))

## [1.22.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.22.0...veta-trading-platform-v1.22.1) (2026-05-04)


### Bug Fixes

* **login:** improve degraded overlay readability and reduce flicker ([53e48dd](https://github.com/milesburton/veta-trading-platform/commit/53e48ddb267daf893d7cd9d5b97dc4359930e6d8))

## [1.22.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.21.0...veta-trading-platform-v1.22.0) (2026-05-04)


### Features

* add degraded services overlay on login page ([774bd60](https://github.com/milesburton/veta-trading-platform/commit/774bd60e8847929c4b272d4138d40779f428a626))


### Bug Fixes

* **frontend:** a11y violations surfaced by visual-anomaly check ([4872743](https://github.com/milesburton/veta-trading-platform/commit/4872743f59a8f75aa5c32ccd38fd19adfb714996))
* **frontend:** a11y violations surfaced by visual-anomaly check (part 2) ([8ce102f](https://github.com/milesburton/veta-trading-platform/commit/8ce102fc40404daaa3c6986df6f8f933599c6499))

## [1.21.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.20.1...veta-trading-platform-v1.21.0) (2026-05-04)


### Features

* **ui:** environment watermark on UAT, subtle LOCAL badge in dev ([1da2bce](https://github.com/milesburton/veta-trading-platform/commit/1da2bcec6e1ecceda34bc2774fd0fa40d8cdf007))

## [1.20.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.20.0...veta-trading-platform-v1.20.1) (2026-05-03)


### Bug Fixes

* **login:** unblock sign-in on insecure origins; surface and transport errors ([51cec86](https://github.com/milesburton/veta-trading-platform/commit/51cec86611d6f0fdb0c37627b21c3dbe81db042a))

## [1.20.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.19.3...veta-trading-platform-v1.20.0) (2026-05-03)


### Features

* **journal:** capture pipeline latency and expose /metrics/latency ([a9e3c96](https://github.com/milesburton/veta-trading-platform/commit/a9e3c96d90ee9aa2bb54a8f24632a6a5070bfb67))
* **load-test:** generate flowable orders + add p99 latency assertion ([a83fb23](https://github.com/milesburton/veta-trading-platform/commit/a83fb23ef0121b234566cea83200e58441b82970))
* **loadtest:** add k6 + Grafana dashboard for pipeline load testing ([a53b579](https://github.com/milesburton/veta-trading-platform/commit/a53b57961f76a0896a54c2bdc67a5920989c8e46))
* **ui:** pinnable Market Data Depth — drawer + dashboard panel ([1b3c8c2](https://github.com/milesburton/veta-trading-platform/commit/1b3c8c278724fca14770448d5668604baa48a0ab))
* **ui:** stackable drawers with DataDepth detail panel ([a4f5d30](https://github.com/milesburton/veta-trading-platform/commit/a4f5d30c9d6acc5df8708590ac7088ca79c6956d))


### Bug Fixes

* build-info display, login cleanup, gateway proxy gaps ([e49cc95](https://github.com/milesburton/veta-trading-platform/commit/e49cc955c078f853caefa46b5b5845fad675198c))
* **frontend:** restore biome formatting and fix typecheck errors in tests ([0ba71f4](https://github.com/milesburton/veta-trading-platform/commit/0ba71f4e8142ff75b4492259f60bac13ecf3da77))
* remove personal email default and correct Traefik deployment filter ([dbff9a2](https://github.com/milesburton/veta-trading-platform/commit/dbff9a2c1fc64d20915339a45ea4d25f2188a0c9))

## [1.19.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.19.2...veta-trading-platform-v1.19.3) (2026-04-18)


### Bug Fixes

* **docs:** align homepage cards and restore live badges ([3471199](https://github.com/milesburton/veta-trading-platform/commit/3471199f7176b2b6f22e9e680fa6d5d88f7497ae))

## [1.19.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.19.1...veta-trading-platform-v1.19.2) (2026-04-16)


### Reverts

* restore /workspaces/virtual-equities-trading-application paths ([dd70bd1](https://github.com/milesburton/veta-trading-platform/commit/dd70bd1c5042c20a7b883028fcb7e46eccb70444))

## [1.19.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.19.0...veta-trading-platform-v1.19.1) (2026-04-16)


### Bug Fixes

* **fly:** register product-service in supervisord-fly ([de0beb4](https://github.com/milesburton/veta-trading-platform/commit/de0beb4851ecc5ba15133e43ec407f00b556396e))

## [1.19.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.18.0...veta-trading-platform-v1.19.0) (2026-04-16)


### Features

* **logger:** add @veta/logger for structured JSON logs ([4c9b270](https://github.com/milesburton/veta-trading-platform/commit/4c9b270a09b755c791484a3884cc541011a077e1))
* **risk:** circuit breakers, position limits, and P&L stop ([f912efd](https://github.com/milesburton/veta-trading-platform/commit/f912efd657941186366148c52b4608dea8ec93c0))


### Bug Fixes

* **docker:** copy shared/ into frontend build contexts ([5437a2c](https://github.com/milesburton/veta-trading-platform/commit/5437a2c1b71d7009f27ef516758862b1cf908500))

## [1.18.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.17.1...veta-trading-platform-v1.18.0) (2026-04-15)


### Features

* **alerts:** mute rules, source filtering, critical overlay + DevTools panel ([21fcd61](https://github.com/milesburton/veta-trading-platform/commit/21fcd61a9a9e68dc8bec4ff5f56ea63c7bc049ef))


### Bug Fixes

* stabilize devcontainer workspace paths and tooling ([a1e5daa](https://github.com/milesburton/veta-trading-platform/commit/a1e5daa17c791167c88d0a5e38969533def7eada))

## [1.17.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.17.0...veta-trading-platform-v1.17.1) (2026-04-13)


### Bug Fixes

* defer gateway WebSocket until after auth, remove pre-auth service polling ([ab0659d](https://github.com/milesburton/veta-trading-platform/commit/ab0659d371265e43637879857680b140ca4ca5e8))
* eliminate all explicit any types, enforce noExplicitAny as error ([596b5b9](https://github.com/milesburton/veta-trading-platform/commit/596b5b946fb1529c242feb823b9643f0ed665b79))


### Performance Improvements

* backpressure, memoisation, and pool tuning across stack ([b43786b](https://github.com/milesburton/veta-trading-platform/commit/b43786b07febcd51e62daa212b025f1927a0041a))
* targeted React performance fixes from profiling audit ([e342cd1](https://github.com/milesburton/veta-trading-platform/commit/e342cd1e03c926043868085265afbdb324ccd09e))

## [1.17.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.16.2...veta-trading-platform-v1.17.0) (2026-04-13)


### Features

* add MCP config for Ollama via host.docker.internal ([7b47b4b](https://github.com/milesburton/veta-trading-platform/commit/7b47b4b77456c9c99315787af5a9f1acfd44d9b8))
* **ci:** add test-count badges for all test suites + fix README typos ([573bc57](https://github.com/milesburton/veta-trading-platform/commit/573bc57c1a33c33a0ef450385b2f8031e694822d))
* **docs:** replace static GitHub Pages with Astro + Starlight docs site ([e27ea75](https://github.com/milesburton/veta-trading-platform/commit/e27ea7517d02ef455b874e5d46b9dba20aba7d3e))
* multi-select and permission-gated order actions in blotter ([3d734df](https://github.com/milesburton/veta-trading-platform/commit/3d734df84cac4b094ce45a651bb303ed2bb00f87))
* pre-populate demo credentials, add docs link, expand roadmap ([136bcda](https://github.com/milesburton/veta-trading-platform/commit/136bcda4f4952e19789d8bd3ff72312adec5aafc))
* symbol search bar with typeahead, identifiers, and trade paste parser ([6be87a2](https://github.com/milesburton/veta-trading-platform/commit/6be87a233dee339819b4591afd9446a9acaf2d26))
* system status bar with data depth, quality warnings, and upgrade banner ([aece3f5](https://github.com/milesburton/veta-trading-platform/commit/aece3f5a6c4fd914e28bd1a77b496ff4a4d3f7cd))


### Bug Fixes

* add consumer crash watchdog for automatic Kafka reconnection ([135a820](https://github.com/milesburton/veta-trading-platform/commit/135a82023839ee319f816a7298ab99354d732b00))
* **ci:** mkdir for Pages screenshots + mark Fly.io smoke tests non-blocking ([48412e3](https://github.com/milesburton/veta-trading-platform/commit/48412e3489e4f520140431366b486dfac857a1ea))
* **docs:** show sidebar on landing page + add Getting Started link ([65763a3](https://github.com/milesburton/veta-trading-platform/commit/65763a35a406de1c8c982f7ea89e5ec5517fc71c))
* **homelab:** add restart policy to Traefik container ([261500b](https://github.com/milesburton/veta-trading-platform/commit/261500bdbbcd5974c18773b8040eadfffd82513b))


### Performance Improvements

* **ci:** parallelize Playwright, screenshots, Docker alongside integration ([dfd59d6](https://github.com/milesburton/veta-trading-platform/commit/dfd59d60e7b74272ab2553fd8620172b17721311))


### Reverts

* remove MCP config — not needed for this project ([699ddcf](https://github.com/milesburton/veta-trading-platform/commit/699ddcfa22cf89eff3159644ca1b30b838193bc9))

## [1.16.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.16.1...veta-trading-platform-v1.16.2) (2026-04-12)


### Bug Fixes

* **rbac:** allow FI/commodities voice traders access to order-ticket and vol-surface ([c6f305d](https://github.com/milesburton/veta-trading-platform/commit/c6f305d0fcbfc96cae1c5254d5c654cac22538cc))
* **tests:** restore derivatives desk for default trader + skip analyst order-ticket test ([3ad3f7e](https://github.com/milesburton/veta-trading-platform/commit/3ad3f7e9f12e4f2b980011c446d9ede3b351257d))

## [1.16.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.16.0...veta-trading-platform-v1.16.1) (2026-04-12)


### Bug Fixes

* **ci:** mark smoke tests continue-on-error (SNIPER/IS/MOMENTUM settled-order flakes) ([987ada3](https://github.com/milesburton/veta-trading-platform/commit/987ada32e1ba68d09bf03522a3d0a4aca3fdf930))

## [1.16.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.15.0...veta-trading-platform-v1.16.0) (2026-04-12)


### Features

* **ci:** add test coverage reporting with badge + strip test comments ([f39c1ce](https://github.com/milesburton/veta-trading-platform/commit/f39c1cebaf47acf1e28b0ecde3159822c1ae2f3e))
* **rbac:** introduce risk-manager role and Maya Tanaka persona ([563fc74](https://github.com/milesburton/veta-trading-platform/commit/563fc74c8e7d218c889fd7735ac8a1d965a25f5c))
* **risk:** add pre-trade risk-engine with fat-finger, duplicate, and max-open-orders checks ([acc14cd](https://github.com/milesburton/veta-trading-platform/commit/acc14cdbc4d6591ffe01531e1a6dcd02dcf8ca6c))
* **risk:** add self-cross, ADV, rate-limit checks and live position tracking ([f11ef1e](https://github.com/milesburton/veta-trading-platform/commit/f11ef1ea0abe685c1dc5cc1a71576390d3ba8443))
* **risk:** Risk Dashboard + My Positions panels with live P&L ([e192605](https://github.com/milesburton/veta-trading-platform/commit/e192605e67bd16c126f1f89a4e6a96dfd75e6772))


### Bug Fixes

* add risk-manager to /personas query + mark SNIPER/IS/MOMENTUM smoke tests non-blocking ([b8bf05f](https://github.com/milesburton/veta-trading-platform/commit/b8bf05f506e270242396034c9d4ddd3ae0269374))
* **ci:** add retry for flaky algo integration tests (SNIPER/IS/MOMENTUM) ([b1df9e6](https://github.com/milesburton/veta-trading-platform/commit/b1df9e692283c834bd51040cfd9cea86b4ff48e4))
* **ci:** add RISK_ENGINE_ENABLED toggle, disable for algo integration tests ([4cc3794](https://github.com/milesburton/veta-trading-platform/commit/4cc3794d1cc615b76d7410af0446dc843ee8ac7f))
* **ci:** configure risk-engine limits for integration test throughput ([12a33c7](https://github.com/milesburton/veta-trading-platform/commit/12a33c7a6b10e4cf41582580f7e739d0ebdb3bc9))
* **ci:** fix flaky TWAP expiry test + mark algo integration as non-blocking ([1ec9dac](https://github.com/milesburton/veta-trading-platform/commit/1ec9dac11fd47e195f50115edd7c4a1d27709f94))
* **ci:** read initialPrice from market-sim /assets (not price) ([e3c4910](https://github.com/milesburton/veta-trading-platform/commit/e3c4910d88faa3725ffcab9a0c3be267f7f1d85a))
* **ci:** skip timing-dependent TWAP expiry test under coverage ([cfb4603](https://github.com/milesburton/veta-trading-platform/commit/cfb46038a03d41066914c8636c4a34b22db8e67b))
* **ci:** wait for risk-engine prices before integration tests + strengthen pre-commit ([1cdba23](https://github.com/milesburton/veta-trading-platform/commit/1cdba23ef5adfd84ed99531af0fc26ced796b955))

## [1.15.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.14.2...veta-trading-platform-v1.15.0) (2026-04-08)


### Features

* **personas:** demo persona picker on login + style-aware default workspace ([c060b6f](https://github.com/milesburton/veta-trading-platform/commit/c060b6f68d80c667336b4916df050b976720592b))
* **personas:** realistic desk segregation and high/low-touch RBAC ([dd9ac78](https://github.com/milesburton/veta-trading-platform/commit/dd9ac78f85f187c7bd6db575059cfe42e684fae1))

## [1.14.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.14.1...veta-trading-platform-v1.14.2) (2026-04-07)


### Bug Fixes

* **ci:** make electron screenshot push survive unstaged build artefacts ([7abfe80](https://github.com/milesburton/veta-trading-platform/commit/7abfe80e10ef0669463c90541e580970f1fd2870))
* **ci:** unblock electron screenshot capture from flaky E2E tests ([3665d5f](https://github.com/milesburton/veta-trading-platform/commit/3665d5f6555412a73df24f1780e53ac5f1316515))

## [1.14.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.14.0...veta-trading-platform-v1.14.1) (2026-04-07)


### Bug Fixes

* **fly:** cap supervisord logs and add deploy retry/concurrency ([247b77b](https://github.com/milesburton/veta-trading-platform/commit/247b77bd4c2149347aa7666c094c223198e08273))

## [1.14.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.13.1...veta-trading-platform-v1.14.0) (2026-04-06)


### Features

* **permissions:** centralize panel RBAC and remove order-ticket from defaults ([48a6777](https://github.com/milesburton/veta-trading-platform/commit/48a67774e7881a11b76ba752b3d44ab496a14553))


### Bug Fixes

* **login:** remove OAuth2 wording from UI, add disk monitoring, login smoke tests ([47ba8c4](https://github.com/milesburton/veta-trading-platform/commit/47ba8c44435a5cbfd5d9d8471754fc5491975fa9))
* **tests:** update remaining 'sign in with oauth2' regex to 'sign in' ([74cd194](https://github.com/milesburton/veta-trading-platform/commit/74cd194bdade225e1a71060605812e9c10b2b6b4))

## [1.13.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.13.0...veta-trading-platform-v1.13.1) (2026-04-06)


### Bug Fixes

* **gateway:** forward HTTP method in proxyGet so DELETE requests work ([541ee65](https://github.com/milesburton/veta-trading-platform/commit/541ee6544f919bff9846011dee39fe86248a0166))

## [1.13.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.12.5...veta-trading-platform-v1.13.0) (2026-04-05)


### Features

* **replay:** add session replay with rrweb recording and playback ([9c0cfed](https://github.com/milesburton/veta-trading-platform/commit/9c0cfed233e31a3b2a2c4ff2979e3f2249d19461))


### Bug Fixes

* **ci:** add replay-service to CI integration tests and Fly.io supervisord ([ff9b04d](https://github.com/milesburton/veta-trading-platform/commit/ff9b04d36c22d29aa40900825af225868495c259))
* **ci:** repair integration test and Biome-corrupted ElectronMockServer ([50aad3d](https://github.com/milesburton/veta-trading-platform/commit/50aad3da27d1f4420463a9d54bd44d363d8113e5))
* **tests:** authenticate replay smoke tests for Fly.io, fix E2E route ordering ([416a135](https://github.com/milesburton/veta-trading-platform/commit/416a1356082c28e5c42ce1d7ec7f799abbd02cd9))
* **tests:** import and re-export auth fixtures from GatewayMock ([75b296c](https://github.com/milesburton/veta-trading-platform/commit/75b296c31d1b4ea852bab95853ce86f6a88a50c1))
* **tests:** re-export auth fixtures from GatewayMock for downstream imports ([32a9257](https://github.com/milesburton/veta-trading-platform/commit/32a9257dc14f1c16a4d2147cdfc67da5130d6626))
* **tests:** unroute then re-route replay sessions in E2E for correct mock data ([7147310](https://github.com/milesburton/veta-trading-platform/commit/71473108327e6dcd3e7e5bb61042919c9476339e))

## [1.12.5](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.12.4...veta-trading-platform-v1.12.5) (2026-04-04)


### Bug Fixes

* **deploy:** use single machine on Fly.io to avoid auth cache split ([4c0d81d](https://github.com/milesburton/veta-trading-platform/commit/4c0d81d68c670fe3ae9dc26979d9e62d209edfde))
* **smoke:** consume response bodies before assertions and add retry ([446cc2e](https://github.com/milesburton/veta-trading-platform/commit/446cc2e555da2201d59d569006f4f2c845b5bd77))
* **smoke:** increase submitOrderWithRetry to 5 attempts with backoff ([7a2eced](https://github.com/milesburton/veta-trading-platform/commit/7a2eced5e63af4adfda9ff7545d15c9393e729f6))

## [1.12.4](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.12.3...veta-trading-platform-v1.12.4) (2026-04-03)

### Bug Fixes

- **layout:** reorganise execution model — ladder | ticket + blotter
  ([64d9f70](https://github.com/milesburton/veta-trading-platform/commit/64d9f70c05390c280f0672215bfb5049ce4ab57b))

## [1.12.3](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.12.2...veta-trading-platform-v1.12.3) (2026-04-02)

### Bug Fixes

- **ci:** pull-rebase before pushing screenshot commits
  ([1225611](https://github.com/milesburton/veta-trading-platform/commit/1225611a2b651561d964afd7fedd4b8c39fdf8d6))
- **electron:** catch tray creation failure in headless CI
  ([e409f94](https://github.com/milesburton/veta-trading-platform/commit/e409f9479fa6199df4d435fe0cb85eb219a561a8))

## [1.12.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.12.1...veta-trading-platform-v1.12.2) (2026-04-02)

### Bug Fixes

- **e2e:** add order-ticket to execution model and fix tab title matching
  ([e3607c0](https://github.com/milesburton/veta-trading-platform/commit/e3607c026a0487277248442922f9c1f027a19d44))
- **e2e:** clear saved layouts before each test navigation
  ([74a7ae9](https://github.com/milesburton/veta-trading-platform/commit/74a7ae9c087f36a7f184570f52df26e520b30c9c))
- **e2e:** fallback to strategy-select when Order Ticket tab not found
  ([4492f55](https://github.com/milesburton/veta-trading-platform/commit/4492f550249d1123999ced6392f753e7c5232358))
- **e2e:** handle FlexLayout tab overflow in panelByTitle
  ([7700d79](https://github.com/milesburton/veta-trading-platform/commit/7700d791d7592a67eb6e1cdf80e540d6879505c1))
- **e2e:** override Desktop Chrome viewport to 1920x1080
  ([d99df2b](https://github.com/milesburton/veta-trading-platform/commit/d99df2bd2a52d08dd2f46aa6647e15c447fc9699))
- **e2e:** rewrite algo-orders to use injectOrder instead of Order Ticket UI
  ([3a53127](https://github.com/milesburton/veta-trading-platform/commit/3a53127b0ea01d006c9234f172a82b6f0d829840))
- **e2e:** use 1920x1080 viewport for Playwright tests
  ([0e4a0c1](https://github.com/milesburton/veta-trading-platform/commit/0e4a0c1357458b1092ab293ab2c1ad2f2400fd17))

## [1.12.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.12.0...veta-trading-platform-v1.12.1) (2026-03-31)

### Bug Fixes

- **ci:** disable vite proxy in Playwright test mode
  ([c6753aa](https://github.com/milesburton/veta-trading-platform/commit/c6753aaf484603f9faa3cdb449cc9a6270a2d9c9))
- **screenshots:** realistic trading data, proper heatmap colours, more orders
  ([6e6ceea](https://github.com/milesburton/veta-trading-platform/commit/6e6ceea04a5a1dbf7b6366a32b63434a73a0cb4d))

## [1.12.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.11.1...veta-trading-platform-v1.12.0) (2026-03-31)

### Features

- bond pricing, mock OAuth2, viewer role, RBAC hardening
  ([71b37bb](https://github.com/milesburton/veta-trading-platform/commit/71b37bb0518902ff7409049a7101515ccec263b8))
- **ops:** add lightweight smoke runner Docker image
  ([5be5183](https://github.com/milesburton/veta-trading-platform/commit/5be51830310319c2c634826de3e05bc1f1eeb236))

### Bug Fixes

- **ci:** switch Playwright from vite preview to vite dev server
  ([111cfdc](https://github.com/milesburton/veta-trading-platform/commit/111cfdc8bd786a3af4180d5f6b62d578d787efda))
- **e2e:** increase algo-orders timeouts for CI runners
  ([816cd33](https://github.com/milesburton/veta-trading-platform/commit/816cd33e16c548b8741acd54dc570f7173a6ed16))

## [1.11.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.11.0...veta-trading-platform-v1.11.1) (2026-03-30)

### Bug Fixes

- **ci:** unblock Docker build from flaky Electron/Playwright E2E jobs
  ([01fc925](https://github.com/milesburton/veta-trading-platform/commit/01fc9256418096140fef3973d8ff5462e593379f))
- **popout:** add contextual header with panel name, channel links, and status
  ([8693683](https://github.com/milesburton/veta-trading-platform/commit/869368389387e0c7e82e915390055b358fd585f4))

## [1.11.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.10.0...veta-trading-platform-v1.11.0) (2026-03-30)

### Features

- **market:** add trading calendar with session schedule, holidays, early closes
  ([b1d53f9](https://github.com/milesburton/veta-trading-platform/commit/b1d53f92cd547e8bfe1f175438a4692f3861e7e9))
- **ticket:** add FieldDefinition registry, ResolvedField output, FK constants
  ([79319ec](https://github.com/milesburton/veta-trading-platform/commit/79319ecb287bebaaadccaa1c516d84c02aec1f86))
- **ticket:** add price collar rule and async pre-trade risk validation
  ([9e597f7](https://github.com/milesburton/veta-trading-platform/commit/9e597f75414d7b3cd55375af7c8e6e03d97b47d5))
- **ticket:** add session phase awareness and venue capability model
  ([9149569](https://github.com/milesburton/veta-trading-platform/commit/914956988f271f87d5ffb273db8c4092fbd991dc))
- **ticket:** extract domain rule engine; add price pre-warm and open prices
  ([02e6c87](https://github.com/milesburton/veta-trading-platform/commit/02e6c87afb0e781c7b0ad8de3b55f4ec66c53ade))

### Bug Fixes

- **ci:** add .npmrc with legacy-peer-deps for storybook/vite7 compat
  ([320a6c0](https://github.com/milesburton/veta-trading-platform/commit/320a6c046fc7fb85b6558a7012127e8ce3f40beb))
- **devcontainer:** wire postgres via Docker Compose; remove broken supervisord
  entry
  ([eb77f2f](https://github.com/milesburton/veta-trading-platform/commit/eb77f2f1c55a0bd9f45da43c089220f011d177b7))
- **electron:** correct MOTD launch path; replace tray icon; fix blank line
  ([ff7fc85](https://github.com/milesburton/veta-trading-platform/commit/ff7fc8527f04b3cac254a67ca7e35f311d536f2c))

## [1.10.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.9.1...veta-trading-platform-v1.10.0) (2026-03-27)

### Features

- **market-data:** add multi-provider architecture with Alpha Vantage FX,
  Tiingo, Polygon, and FRED
  ([5668d9b](https://github.com/milesburton/veta-trading-platform/commit/5668d9ba3e10815a99a83c8597e756f0f174217e))
- **market-sim:** add FX and commodity futures to the trading universe
  ([c718d95](https://github.com/milesburton/veta-trading-platform/commit/c718d95aefee7ff249326494ba95eafed1322133))
- **sell-side:** add external-client, sales roles and full RFQ+product workflow
  ([2613146](https://github.com/milesburton/veta-trading-platform/commit/26131460a3aeb97dcf623bee5ee8e1d63df99bee))
- **storybook:** add Storybook 8 with MSW and stories for 5 key panels
  ([c0ff9d9](https://github.com/milesburton/veta-trading-platform/commit/c0ff9d99c877488b0e8a4d48dabe915419c7d4f8))
- **users:** add 8 new trader personas across equity, FX, options, and
  commodities desks
  ([08c6a95](https://github.com/milesburton/veta-trading-platform/commit/08c6a959fc10dcdc1d23d9e9aa067ad9878a5ddb))

## [1.9.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.9.0...veta-trading-platform-v1.9.1) (2026-03-27)

### Bug Fixes

- **order-ticket:** use lotSize=1 fallback so tests aren't blocked
  ([5f0efe4](https://github.com/milesburton/veta-trading-platform/commit/5f0efe42c3b5cc8f605b98c1faa12f003e609d5d))

## [1.9.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.8.0...veta-trading-platform-v1.9.0) (2026-03-27)

### Features

- **electron:** fix dev mode launch in Dev Container + add system manual
  ([4cc91d1](https://github.com/milesburton/veta-trading-platform/commit/4cc91d1f1d6ace52def627475ac69c1c87b9f81b))
- **trading:** add lot sizes and basket order panel
  ([ecd5487](https://github.com/milesburton/veta-trading-platform/commit/ecd54878b080144b4156416953e8e12b56c619b7))

## [1.8.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.7.0...veta-trading-platform-v1.8.0) (2026-03-26)

### Features

- **dashboard:** separate equities/FI/commodities into clean domain workspaces
  ([3373082](https://github.com/milesburton/veta-trading-platform/commit/3373082c3d72a83f0ac66cf95066b92ff6c13961))
- **estate-overview:** table layout for service health; hide Traefik on non-fly
  deployments
  ([28dbef4](https://github.com/milesburton/veta-trading-platform/commit/28dbef43a6d4d9323545e494058fdd5021fc9334))

### Bug Fixes

- **ci:** add continue-on-error to Electron job
  ([e518410](https://github.com/milesburton/veta-trading-platform/commit/e5184104e17e3a5936856563db2668334bada583))
- **ci:** replace libasound2 with libasound2t64 for Ubuntu 24.04
  ([922c505](https://github.com/milesburton/veta-trading-platform/commit/922c505cc2ffba6503d16f396c52f4240ed1b88a))
- **e2e:** bypass order ticket dialog backdrop via JS click in panelByTitle
  ([62f7b18](https://github.com/milesburton/veta-trading-platform/commit/62f7b18b9c3aef8a8a73e8e0c17357a07544bd72))
- **e2e:** close order ticket dialog before clicking FlexLayout tab buttons
  ([bc5fa4b](https://github.com/milesburton/veta-trading-platform/commit/bc5fa4b56c9e2c4d24316a2b6bacdf0531b11ee4))
- **e2e:** robust dialog/panel interop — close-then-reopen pattern
  ([cb44b80](https://github.com/milesburton/veta-trading-platform/commit/cb44b801b34e84e458f8fd0cf307741ed5058786))
- **electron-ci:** fix crash flags and increase beforeAll timeout to 90s
  ([cba6abd](https://github.com/milesburton/veta-trading-platform/commit/cba6abd72ed9a29abc09882e4cf8dc31c564649d))
- **electron-ci:** increase firstWindow timeout to 60s, add
  --disable-software-rasterizer
  ([bd0bac2](https://github.com/milesburton/veta-trading-platform/commit/bd0bac2ddf84730fd08ec857fe5584d327ee2180))
- **electron-ci:** show window immediately in test mode (NODE_ENV=test)
  ([db07276](https://github.com/milesburton/veta-trading-platform/commit/db072765798518dd0d71b6b832f8d5f8304a684b))

## [1.7.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.6.0...veta-trading-platform-v1.7.0) (2026-03-26)

### Features

- **dashboard:** redesign workspaces for single-function focus
  ([#4](https://github.com/milesburton/veta-trading-platform/issues/4)+[#6](https://github.com/milesburton/veta-trading-platform/issues/6))
  ([dacb06a](https://github.com/milesburton/veta-trading-platform/commit/dacb06a4e902fa410046f08ffba5d9102dc40f33))
- **electron:** add desktop screenshots to README; update CI to capture them
  ([f704c0a](https://github.com/milesburton/veta-trading-platform/commit/f704c0a6912f41c4f0f7a35f391a57d330566d89))
- **electron:** add sanity tests, fix build chain, and enable CI
  ([8a96356](https://github.com/milesburton/veta-trading-platform/commit/8a96356438ff5f33f56da6707901e6392c1230c8))
- **electron:** mock backend for screenshots; fix bare fetch URLs for Electron
  builds
  ([c5836b8](https://github.com/milesburton/veta-trading-platform/commit/c5836b8e6ce866a2ffcbca484150be47ccc47724))
- **order-ticket:** convert to modal dialog for fat-finger protection
  ([#5](https://github.com/milesburton/veta-trading-platform/issues/5))
  ([bca53ed](https://github.com/milesburton/veta-trading-platform/commit/bca53edb22e68ba6c25eedc7019e3f4860d0e35d))

### Bug Fixes

- **heatmap:** use session-open price for % change instead of 60-tick rolling
  window
  ([7b078b0](https://github.com/milesburton/veta-trading-platform/commit/7b078b0f7d427ac24b7ba59f15eaf0343ba4f34a))
- **screenshots:** populate blotter before opening CF dialog in screenshot 09
  ([e58711b](https://github.com/milesburton/veta-trading-platform/commit/e58711b259d70eef3f9b2962e69fbc731fe3b102))
- **screenshots:** suppress service-health CRITICAL banners; fix qty param
  ([ea4282e](https://github.com/milesburton/veta-trading-platform/commit/ea4282ebacf411cc13fcd22006511bdfc2280857))

## [1.6.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.5.0...veta-trading-platform-v1.6.0) (2026-03-25)

### Features

- **screenshots:** add heatmap, kill switch, column formatting; fix service
  offline note
  ([10fd6ff](https://github.com/milesburton/veta-trading-platform/commit/10fd6ffcfbc920ef223e132d52b940605dd7a3fd))
- **screenshots:** automated UI screenshots captured by Playwright on every main
  push
  ([e515d11](https://github.com/milesburton/veta-trading-platform/commit/e515d11e94850584cc2613da5663ad0822505f83))
- **system-status:** host resource gauges with disk/memory alerts
  ([bc1c3f0](https://github.com/milesburton/veta-trading-platform/commit/bc1c3f04ed8aea2b2d9df79bbf964d89aa2596af))

### Bug Fixes

- **alerts:** suppress service-health toast flood; reorder README sections
  ([2069cb1](https://github.com/milesburton/veta-trading-platform/commit/2069cb119409dbdbeff51c9605b2a6dfee5bae82))
- **compose:** use wget for Ollama healthcheck; remove unused anchor
  ([99fe9af](https://github.com/milesburton/veta-trading-platform/commit/99fe9af9b479633e77243f250658c200b39ac687))

## [1.5.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.4.1...veta-trading-platform-v1.5.0) (2026-03-25)

### Features

- **dashboard,news:** admin workspace split, news CRUD, fix gateway news proxy
  ([d63f7f5](https://github.com/milesburton/veta-trading-platform/commit/d63f7f517012f1a52bb88105bf96f3d9f64bd179))
- **status:** feed heartbeat indicator + candle chart theme fix
  ([d07afad](https://github.com/milesburton/veta-trading-platform/commit/d07afadf04f8f251a9d0ac2927f2e4e6c38f72a8))

### Bug Fixes

- **estate-overview:** replace Grafana iframe with native event feed
  ([aa61671](https://github.com/milesburton/veta-trading-platform/commit/aa6167144da8b0acf10f937f6734f790d7118a20))
- **order-ticket:** default price from live feed once available
  ([bcb99e4](https://github.com/milesburton/veta-trading-platform/commit/bcb99e477d6b8969e02fcad9d71b95d633619bac))
- **redpanda:** add init service to enforce topic retention limits
  ([c8120b6](https://github.com/milesburton/veta-trading-platform/commit/c8120b65481dded670e87ca07c426297c8ca0fb7))
- **startup-overlay:** table layout for service list; fix 0/N count
  ([253909b](https://github.com/milesburton/veta-trading-platform/commit/253909b33f48daebcf45a52c34b217e34fe94d33))

## [1.4.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.4.0...veta-trading-platform-v1.4.1) (2026-03-23)

### Bug Fixes

- **tests,dashboard:** update E2E specs for Grafana removal and new admin
  templates
  ([e80c474](https://github.com/milesburton/veta-trading-platform/commit/e80c474d8e4622b2fa13e26a54ca5fee0b7b3f28))

## [1.4.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.3.2...veta-trading-platform-v1.4.0) (2026-03-23)

### Features

- **dashboard:** split Mission Control into feature workspaces; remove Grafana
  ([21c60d4](https://github.com/milesburton/veta-trading-platform/commit/21c60d4a82fb205d5381613c02faa1d52a89dbbe))

## [1.3.2](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.3.1...veta-trading-platform-v1.3.2) (2026-03-23)

### Bug Fixes

- **services:** mark observability services optional; allow Fly.io idle suspend
  ([0d62f2e](https://github.com/milesburton/veta-trading-platform/commit/0d62f2e7a2a6084bc23380f24bc288a6472c8ea6))

## [1.3.1](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.3.0...veta-trading-platform-v1.3.1) (2026-03-22)

### Bug Fixes

- **compose:** correct fix-exchange health check port (9879 not 9880)
  ([645b91e](https://github.com/milesburton/veta-trading-platform/commit/645b91ee4c9c25d8ecf4d0d057208755e70d55f4))
- **compose:** raise Redpanda memory to 1G and service limits to 512m/768m
  ([1f29eb9](https://github.com/milesburton/veta-trading-platform/commit/1f29eb9ffadcf010b2e42abaaec55c9a4a6d6fdb))

### Performance Improvements

- **gateway:** cache /ready health checks — refresh every 5s in background
  ([56ddedb](https://github.com/milesburton/veta-trading-platform/commit/56ddedbd1241280ac114fe9c14eb52e4843ef905))

## [1.3.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.2.0...veta-trading-platform-v1.3.0) (2026-03-22)

### Features

- **docker:** bake COMMIT_SHA into service images at build time
  ([65d7f7a](https://github.com/milesburton/veta-trading-platform/commit/65d7f7ab8b172f8ff5ffa865918ed43487b307ee))
- **ui:** smarter startup overlay — skip on refresh, waiting mode, hover
  descriptions
  ([c6386c2](https://github.com/milesburton/veta-trading-platform/commit/c6386c27a773d956b07707e74a1ebe286e45b89f))

### Bug Fixes

- **algo-test:** lower MOMENTUM entryThresholdBps to 0.01 for reliable
  triggering
  ([650b294](https://github.com/milesburton/veta-trading-platform/commit/650b2944f59ce00031f31ca1d6d11da1eb55342f))
- **algo:** lower MOMENTUM threshold minimum to 0.1bps; reduce test warmup
  period
  ([0217e78](https://github.com/milesburton/veta-trading-platform/commit/0217e78c869ab19376f0c4e0bade1e45cf796a0f))
- **ci:** wait for auth pipeline ready before running Fly.io smoke tests
  ([bf5b571](https://github.com/milesburton/veta-trading-platform/commit/bf5b571e0c03704ae0483dc6de0679752b1874ca))
- **ci:** wait for market-sim before smoke tests
  ([b9aa8ee](https://github.com/milesburton/veta-trading-platform/commit/b9aa8ee1dfa707b758ddbba3252adb037d7b52e6))
- **compose:** add dark-pool/ccp/rfq to prod compose; add missing gateway host
  env vars
  ([e843ec0](https://github.com/milesburton/veta-trading-platform/commit/e843ec09488785466439c630423de570ac343b0d))
- **compose:** add DATABASE_URL to all remaining db.ts-importing services
  ([cf6c409](https://github.com/milesburton/veta-trading-platform/commit/cf6c409abe70a142ede815ac2b8dcad1c012c733))
- **compose:** add DATABASE_URL to analytics/feature/signal-engine; disable LLM
  ollama dep in prod
  ([f2518d4](https://github.com/milesburton/veta-trading-platform/commit/f2518d4dba592d5df262f324ebf2d80e6fc8f2a1))
- **compose:** add missing host env vars to gateway service
  ([292de19](https://github.com/milesburton/veta-trading-platform/commit/292de196670c006a7f8ca7bcb66276834cb5d616))
- **compose:** add profiles: !reset [] to all services in compose.prod.yml
  ([bd62825](https://github.com/milesburton/veta-trading-platform/commit/bd628257bd90a835e66fdc650be87a124e9eaa0c))
- **compose:** disable frontend healthcheck until new image with curl ships; fix
  Traefik dashboard port
  ([fc2b705](https://github.com/milesburton/veta-trading-platform/commit/fc2b70563acf7e51dd6223fc18f3e2d2606727aa))
- **compose:** remove COMMIT_SHA env override — now baked into images
  ([9181384](https://github.com/milesburton/veta-trading-platform/commit/918138415be427d28c74933f67d98e47d5db51ab))
- **compose:** set llm-worker restart=no in prod (LLM disabled without ollama)
  ([d476cb8](https://github.com/milesburton/veta-trading-platform/commit/d476cb8d09e01d92890ec349b8e5f54c7da0d5d4))
- **compose:** use db-migrate image (not base) for prod db-migrate service
  ([b56146b](https://github.com/milesburton/veta-trading-platform/commit/b56146be4f98f34695b156d3d197f3d05cf6ceb5))
- **compose:** use wget for frontend healthcheck (no curl in deno image)
  ([feaa72b](https://github.com/milesburton/veta-trading-platform/commit/feaa72bd69224331a55c8e10b37be4b89f3caf6d))
- **deploy:** wait for all services (algos, analytics, aux) before smoke tests
  ([1a3f090](https://github.com/milesburton/veta-trading-platform/commit/1a3f0909d6049f0dfafeda371d63ffdcc219a2d5))
- **fly,ci:** use ld.so for rpk; add producerReady to /ready; bump MOMENTUM
  timeout
  ([c1569c0](https://github.com/milesburton/veta-trading-platform/commit/c1569c0f49afaea2fda8dc92e2f25a2cdd2ac6cc))
- **fly:** start Redpanda directly via ld.so without rpk wrapper
  ([8cbb601](https://github.com/milesburton/veta-trading-platform/commit/8cbb601deb53c0c178ccdb4b3ff012c95f24863e))
- **gateway,fly:** WS fallback for market ticks + Redpanda config dir fix
  ([e581af2](https://github.com/milesburton/veta-trading-platform/commit/e581af2ddb59e4adb6248a0bf5279985a14493d4))
- **gateway,market-sim:** retry Kafka producer in background if not ready at
  startup
  ([08488fb](https://github.com/milesburton/veta-trading-platform/commit/08488fb83e58334043352f5482745331814d7b93))
- **gateway,tests:** increase authCache TTL to 60s; reduce smoke test retry
  aggressiveness
  ([48d8f82](https://github.com/milesburton/veta-trading-platform/commit/48d8f825005dabbc0fb02fa6647505a8581b6430))
- **gateway:** replace chkTcp Redpanda check with HTTP health; remove bus from
  ready gate
  ([0270a47](https://github.com/milesburton/veta-trading-platform/commit/0270a47f69df8ae5184ed5755a0c7959adeb4c6f))
- **homelab:** remove TLS labels from compose.prod.yml; add curl to frontend
  image
  ([345939e](https://github.com/milesburton/veta-trading-platform/commit/345939edd470e60ac9b45edb6ed4d7aadc73c7d3))
- **messaging,test:** reconnect producer on send error; assert MOMENTUM orderAck
  ([35ad652](https://github.com/milesburton/veta-trading-platform/commit/35ad6521a490cd423d67ee426f1b874b40415fb4))
- **messaging:** make createProducer fire-and-forget with internal retry
  ([c35035c](https://github.com/milesburton/veta-trading-platform/commit/c35035c85a2e16a00d3594e827f16a8fa6b4e091))
- **smoke,fly:** fix WS test resource leaks; gate market-sim+gateway on Redpanda
  readiness
  ([32d047c](https://github.com/milesburton/veta-trading-platform/commit/32d047cf08f2ee3289fac3e1322e85bb40c6e53a))
- **smoke:** add /me probe endpoint; switch loginAsVerified from /assets to /me
  ([037434c](https://github.com/milesburton/veta-trading-platform/commit/037434cd351de8e034b2cc1ba7861220dcde82f3))
- **smoke:** add loginAsVerified to eliminate transient auth failures
  ([6972491](https://github.com/milesburton/veta-trading-platform/commit/6972491741c86f8149698754c92a3e746972b16e))
- **smoke:** add submitOrderWithRetry to handle transient auth failures
  ([0833db8](https://github.com/milesburton/veta-trading-platform/commit/0833db8137d60938b5861c451f22c70ad484e996))
- **smoke:** catch transient fetch errors in polling loops; reduce ICEBERG load
  ([fd95a13](https://github.com/milesburton/veta-trading-platform/commit/fd95a13fdf9d138cfd634b001bb152ee5857d6a4))
- **smoke:** exponential backoff in submitOrderWithRetry, 5 max retries
  ([a96cc24](https://github.com/milesburton/veta-trading-platform/commit/a96cc24b4930525770467975d11435e255fad6a5))
- **smoke:** increase usersPool, retry validate test, fix loginAsVerified leak
  ([9af7ee8](https://github.com/milesburton/veta-trading-platform/commit/9af7ee81045950444b2e92e6dfa05884414c2160))
- **smoke:** increase WS timeout to 20s; handle authError; fix livePrice for 401
  responses
  ([8e57e3d](https://github.com/milesburton/veta-trading-platform/commit/8e57e3d64aada274be523435bc3b1ea9d2151ac4))
- **smoke:** reduce expiresAt for slow algos; add MOMENTUM threshold
  ([7524b37](https://github.com/milesburton/veta-trading-platform/commit/7524b379ced57f7705d9e9f59055171e246ad8af))
- **smoke:** retry advisory test on 401; replace ICEBERG settled test
  ([b2b6ac9](https://github.com/milesburton/veta-trading-platform/commit/b2b6ac9c46cbea00bd6e7d62df8454f462edd2d5))
- **tests:** catch loginAs network errors in loginAsVerified; increase retry
  delay
  ([baf5928](https://github.com/milesburton/veta-trading-platform/commit/baf592847646256e8c5c148e472af0cbfb16e92b))
- **ui:** guard against undefined PANEL_TITLES entry in onRenderTab
  ([9f97c89](https://github.com/milesburton/veta-trading-platform/commit/9f97c89fc72a8f75993a81bc40ece5edf7cd82fc))
- **ui:** polyfill crypto.randomUUID for non-secure HTTP contexts
  ([6849a54](https://github.com/milesburton/veta-trading-platform/commit/6849a541818a1bee6a2e1012fbc8b4291c8d1434))

## [1.2.0](https://github.com/milesburton/veta-trading-platform/compare/veta-trading-platform-v1.1.0...veta-trading-platform-v1.2.0) (2026-03-21)

### Features

- add ContextMenu, DecisionLog, MarketMatch components with tests
  ([cb4ac42](https://github.com/milesburton/veta-trading-platform/commit/cb4ac42986b82a5b9a8b203e65afbbb6c67d9ffb))
- Add FIX protocol support and dashboard enhancements
  ([cc33435](https://github.com/milesburton/veta-trading-platform/commit/cc33435e647b27fb757f7c68f16f6e4cd3a18b77))
- add Iceberg, Sniper, Arrival Price algos to platform status grid
  ([6e48318](https://github.com/milesburton/veta-trading-platform/commit/6e48318e3e13b29fd8de0c72e1232d401a3f296a))
- add IS and Momentum algo strategies with full platform wiring
  ([20a1962](https://github.com/milesburton/veta-trading-platform/commit/20a1962bf660dbc854711b4eba02834736b91469))
- add POV and TWAP algo strats. Updated README and other general improvements
  ([53e2c85](https://github.com/milesburton/veta-trading-platform/commit/53e2c8560405e722596f429adeeaa358192c9d6c))
- **alerts:** persist per-user alerts, fix duplicate, add pinnable panel
  ([ee52d12](https://github.com/milesburton/veta-trading-platform/commit/ee52d1266928d0809b8cc722b73cd5a213793530))
- **alerts:** restyle Alert Centre button to match Kill Switch pill shape
  ([2ed7b3d](https://github.com/milesburton/veta-trading-platform/commit/2ed7b3d32f3d28bc64b67630a9f9f1b1acbec86b))
- **algo:** implement ICEBERG strategy (port 5016)
  ([106024c](https://github.com/milesburton/veta-trading-platform/commit/106024c2c4fce0f183f39e92da9dec7f210fbb36))
- **algo:** implement SNIPER and ARRIVAL_PRICE strategies
  ([33f27ef](https://github.com/milesburton/veta-trading-platform/commit/33f27efab739f4a9994ac425caf6a389c5345ffc))
- **algos:** add IS and MOMENTUM strategy support end-to-end
  ([0ed9e7c](https://github.com/milesburton/veta-trading-platform/commit/0ed9e7c43138967c7c8da0f3b419262116b03e70))
- **analysis:** add News & Signals panel with live market news and sentiment
  ([0867145](https://github.com/milesburton/veta-trading-platform/commit/08671458d5aafa0cc66340c2da0ba29d3ea4dfd1))
- **analytics:** add analytics engine with Black-Scholes, scenario matrix, and
  trade recommendations
  ([05731b9](https://github.com/milesburton/veta-trading-platform/commit/05731b9ff31e92cc4acffc32cf68638b9eec11ef))
- auto-reload on new build + transparent reconnects
  ([7064ef1](https://github.com/milesburton/veta-trading-platform/commit/7064ef1457239c8c692ffba7d3076314690c1f15))
- **blotter:** add status tooltips explaining each order state
  ([a220b94](https://github.com/milesburton/veta-trading-platform/commit/a220b942a5db2f97b6cf7594c7c2d8b3f0d2f758))
- **blotter:** auto-select newly submitted order in blotter
  ([fe6a15b](https://github.com/milesburton/veta-trading-platform/commit/fe6a15bd340d8d44ade047f16461c9f4f87c8252))
- **brand:** rename to VETA Platform with build info footer
  ([307121b](https://github.com/milesburton/veta-trading-platform/commit/307121bbb1d38afa1d8f9c9b209a409ecb7a2b89))
- **ccp:** add CCP clearing house service (Phase 4)
  ([bd5e551](https://github.com/milesburton/veta-trading-platform/commit/bd5e5513f772234e1cf7d9389eda247761a77b29))
- **channels:** per-panel numbered channel system for cross-panel communication
  ([cead671](https://github.com/milesburton/veta-trading-platform/commit/cead671324f1a71ebee1bbd4b58aeb4f7c9d6fed))
- **dashboard:** add Child Orders panel with two-way channel linking
  ([7d5ac7c](https://github.com/milesburton/veta-trading-platform/commit/7d5ac7cae27864fdc67076e3f54e7c80c968e75e))
- **dashboard:** fix drag tracking, smart panel placement, layout templates
  ([08b160c](https://github.com/milesburton/veta-trading-platform/commit/08b160ca7f65da6507263771182cb072728f6832))
- **deploy:** add homelab CD pipeline via GHCR + Watchtower
  ([f4948a2](https://github.com/milesburton/veta-trading-platform/commit/f4948a2687d84058205783f044dc015f832e3812))
- **devcontainer:** add Redpanda, fix login, stabilise panel drag
  ([a9686fa](https://github.com/milesburton/veta-trading-platform/commit/a9686fa2618b94d1fdbfe68e62c36a7c19db1fc5))
- **devcontainer:** live service status dashboard (svc-ui)
  ([43eb596](https://github.com/milesburton/veta-trading-platform/commit/43eb5968b46f33c16d4c0e3f74b3e9df5eedf1b9))
- **devcontainer:** replace static banner with live service status on login
  ([7750fc9](https://github.com/milesburton/veta-trading-platform/commit/7750fc9fd885efa9e24d34aa64d77d3f35609b76))
- **devcontainer:** switch to Docker socket passthrough for service management
  ([2a532ce](https://github.com/milesburton/veta-trading-platform/commit/2a532ce86a32542ec3c9f98bd44fb2ef095b0bfe))
- **electron:** add Electron desktop app support with full test coverage
  ([7bbf491](https://github.com/milesburton/veta-trading-platform/commit/7bbf4919ab08fb8ed302f41e62a2f80facd9cf96))
- First commit of a dummy trading platform
  ([f2f03c5](https://github.com/milesburton/veta-trading-platform/commit/f2f03c530ab855815e779abdf6222fda483d9618))
- fix llm-advisory startup, add observability batch endpoint, harden
  devcontainer
  ([2580fd7](https://github.com/milesburton/veta-trading-platform/commit/2580fd7a88b2eafb33e1f7ffe3054f69318eecde))
- fixed income analytics, FI layouts, user personas, and locked templates
  ([5587fea](https://github.com/milesburton/veta-trading-platform/commit/5587fea08c9ab4ee18e86b7499e1d05db1d8abb1))
- **fixed-income:** spread analysis, duration ladder, vol surface, and bond
  order flow
  ([6edfd71](https://github.com/milesburton/veta-trading-platform/commit/6edfd710d880ef63f6410bb8aa5f34b5850bd217))
- **fly:** migrate to supervisord monolith for Fly.io deploy
  ([6f2d80a](https://github.com/milesburton/veta-trading-platform/commit/6f2d80af374b3daffdc6d12e69d55286b27fe052))
- **frontend:** add alert centre with severity-aware notifications
  ([a55540f](https://github.com/milesburton/veta-trading-platform/commit/a55540fe57c4bc86e75ff91cda50e8d3bc19f2b0))
- **frontend:** add data-testid attributes across all components
  ([0c842a9](https://github.com/milesburton/veta-trading-platform/commit/0c842a9760d8704eee1c219752ed74f47ca84452))
- **frontend:** expand test coverage to 77% and clean up README
  ([11fd5f7](https://github.com/milesburton/veta-trading-platform/commit/11fd5f76366f1dfbba2609fc703d1d0b384ad696))
- **frontend:** migrate to Redux Toolkit, signals, pop-out windows, and
  BroadcastChannel
  ([24e57e6](https://github.com/milesburton/veta-trading-platform/commit/24e57e69febf3f4d27f0240a368ce96ab50e9120))
- **gateway:** add /ready endpoint and startup overlay
  ([b8ebc54](https://github.com/milesburton/veta-trading-platform/commit/b8ebc5418073d6555c19eb9509931773932e56ee))
- **gateway:** add generic /api/&lt;service&gt;/* proxy + self-alias for Fly.io
  ([21174cf](https://github.com/milesburton/veta-trading-platform/commit/21174cf73775f32e8656d9d983f79f5a1020f476))
- **gateway:** expand /ready to check all 25 services
  ([bbe563e](https://github.com/milesburton/veta-trading-platform/commit/bbe563ec643e54bb4e7ccef2e4513c0a5b909ca7))
- **grid:** add sortable columns, rich filter engine, and conditional formatting
  ([4c0154b](https://github.com/milesburton/veta-trading-platform/commit/4c0154b26074d67d4de3dcf3864d4332fffd641f))
- **grid:** expression criteria builder, booked-by column, header context menu
  ([cb1dd77](https://github.com/milesburton/veta-trading-platform/commit/cb1dd7704ec805efe40661b2646e78d023e7a18c))
- **grid:** server-side filter/sort query model with TanStack Query
  ([3c78b0a](https://github.com/milesburton/veta-trading-platform/commit/3c78b0a64fd446780c0395b2a22fa8bab64a066b))
- **grid:** unified grid system with column resize/reorder, shared CF ExprGroup
  ([ea3d51d](https://github.com/milesburton/veta-trading-platform/commit/ea3d51d28685d252b3e999fea99767552d6ddd9c))
- **header:** add GitHub repository link to app header
  ([844d299](https://github.com/milesburton/veta-trading-platform/commit/844d2993a8bfcd01e30ec5c670e68cc6f695ad6c))
- **homelab:** add disk-monitor service with auto-prune
  ([81315c8](https://github.com/milesburton/veta-trading-platform/commit/81315c87feed7ec7f2e92314612c8e9e7c23b5cd))
- **homelab:** add Watchtower service to compose for automatic GHCR image
  updates
  ([2265de1](https://github.com/milesburton/veta-trading-platform/commit/2265de1f4765a8cfc66fa909606a1edcbe8d1679))
- **infra:** add Traefik reverse proxy with path-based routing
  ([44c5611](https://github.com/milesburton/veta-trading-platform/commit/44c5611f493fc8243f80911886e2807b3cfb0615))
- **infra:** idle-safe service management for dev container and homelab
  ([4310ecc](https://github.com/milesburton/veta-trading-platform/commit/4310ecc9a1e3dcdcb3c89e80a2690065fdf60848))
- **infra:** migrate to per-service Docker images with unified Compose stack
  ([5f714cd](https://github.com/milesburton/veta-trading-platform/commit/5f714cd3a41680c56a20fa9092a1057e4386cb8f))
- **intelligence:** add LLM advisory subsystem + order auto-select + smoke test
  coverage
  ([7be5ff2](https://github.com/milesburton/veta-trading-platform/commit/7be5ff2ddd9c4bd7b7f56f62bb1c745ffc9933b2))
- **intelligence:** add market intelligence pipeline with LLM advisory
  ([9c845ac](https://github.com/milesburton/veta-trading-platform/commit/9c845ac9fd5c026c7c7b8108ad962f82448b0c17))
- **intelligence:** integrate real market data feeds for signals
  ([5fa2dd0](https://github.com/milesburton/veta-trading-platform/commit/5fa2dd0e9c5edec464e99fe6f52d70f28a492549))
- **intelligence:** persist market events + yield curve for backtesting
  ([a67970d](https://github.com/milesburton/veta-trading-platform/commit/a67970dea00deff94ce31ac00bf91db8b36152ed))
- **killswitch:** add kill switch with block persistence, order warnings, and
  held status
  ([4a514cf](https://github.com/milesburton/veta-trading-platform/commit/4a514cf4e105ab6f4b74dc156406124fa67cdbbc))
- **killswitch:** add kill/resume switch to header bar
  ([0860256](https://github.com/milesburton/veta-trading-platform/commit/086025653b75fdbed9a135467fee83c900bb24d3))
- **layout:** add Market Overview template + cake-stack trading layout
  ([f73972d](https://github.com/milesburton/veta-trading-platform/commit/f73972dac6ff44f604f707fc6a1df7934dd3ff0c))
- **layout:** priority layout redesign + panel pin/unpin capability
  ([a6e0fe3](https://github.com/milesburton/veta-trading-platform/commit/a6e0fe3dbcc1babca3085b1c9d1cac4b83a7f75d))
- **layout:** promote Decision Log to own panel; improve channel indicators
  ([c61984b](https://github.com/milesburton/veta-trading-platform/commit/c61984bb1a721c0963a4a95b1738b56eaf3da08a))
- **layout:** promote Order Progress to top-level column 4
  ([c3ddc5b](https://github.com/milesburton/veta-trading-platform/commit/c3ddc5b98ce3f7f2ec46dcb81783c9fc372cb69c))
- **layout:** replace heatmap with child-orders panel stacked below blotter
  ([e2bc772](https://github.com/milesburton/veta-trading-platform/commit/e2bc772f3b333877f10420321d386c4e95d2e0c2))
- **layouts:** add AI Advisory and Intelligence Hub default layouts
  ([121edd3](https://github.com/milesburton/veta-trading-platform/commit/121edd3c431f1718390ff70cf50fe4d72f92cfec))
- **layout:** sidebar order progress + four-panel vertical stack
  ([11ca259](https://github.com/milesburton/veta-trading-platform/commit/11ca25981ef9146955aeeefb16c0e85ada4224cc))
- **llm:** switch to local Ollama for LLM advisory — no external API required
  ([b068b16](https://github.com/milesburton/veta-trading-platform/commit/b068b169dc484a5111f6a228635c0f7506047a4e))
- **market-data:** add market data source abstraction with Alpha Vantage
  integration
  ([9b4bf0b](https://github.com/milesburton/veta-trading-platform/commit/9b4bf0b95f2a472453e803407dc599096c6f5c36))
- **market-data:** add Market Feed Control panel with global feed pause/resume
  ([fc706eb](https://github.com/milesburton/veta-trading-platform/commit/fc706ebc9524aba740e29c87ce93ddb7f8e1788a))
- **market-sim:** replace random walk with realistic GBM price engine
  ([3dad23b](https://github.com/milesburton/veta-trading-platform/commit/3dad23b4849a21eba658ea4d52541c16776791de))
- migrate all data fetching to RTK Query (universal)
  ([5772048](https://github.com/milesburton/veta-trading-platform/commit/577204811ddab857bcaf88942359974870194cf5))
- multi-workspace support and comprehensive test coverage
  ([36a2ea9](https://github.com/milesburton/veta-trading-platform/commit/36a2ea9b7daeae316d9700b3fe518f2947973fc0))
- **observability:** ship all Redux actions and errors to observability service
  ([916e13b](https://github.com/milesburton/veta-trading-platform/commit/916e13b903b19d787402767a5a796099b3b5a1de))
- **ops:** add OpenSearch + Kafka Connect observability stack
  ([237c8a2](https://github.com/milesburton/veta-trading-platform/commit/237c8a20728612030836e5a78b67747e2e29e967))
- **order-ticket:** add options mode with live Black-Scholes pricing + algo
  stubs
  ([f87c718](https://github.com/milesburton/veta-trading-platform/commit/f87c718d34d90cadc7b45129be50614dd328e10a))
- **orders:** persist and hydrate orders via journal service
  ([bafbd0c](https://github.com/milesburton/veta-trading-platform/commit/bafbd0c407e63c3f6deb178b808db71af95e9f09))
- **phase-1:** desk separation, information barriers, compliance role
  ([c57c143](https://github.com/milesburton/veta-trading-platform/commit/c57c14327f2f13b039967679427517a5a83820e9))
- **phase-2:** dark pool ATS service (port 5027)
  ([dae8a2d](https://github.com/milesburton/veta-trading-platform/commit/dae8a2d5a6a790a1cf6ba5bf985be2976f2f81b1))
- **phase-3:** FI RFQ service (port 5029)
  ([54e47a5](https://github.com/milesburton/veta-trading-platform/commit/54e47a58d404b6145d8233ff55d0d688f1a35c5a))
- **picker:** drag-and-drop panels from picker onto the dashboard
  ([aeece83](https://github.com/milesburton/veta-trading-platform/commit/aeece834d7a64c8d13f04a9b5715ab884a27eb71))
- server-side workspace persistence, delete confirmation, and shared workspace
  registry
  ([0deda36](https://github.com/milesburton/veta-trading-platform/commit/0deda3625bd8b6deb2acfaddf1ac350054a3e192))
- **services:** mark all services as required
  ([770c993](https://github.com/milesburton/veta-trading-platform/commit/770c993fa24e2b35de01f91bbe8b03cf66aab3b6))
- **shared-workspaces:** add description, search filter, and hide own entries
  ([974fabd](https://github.com/milesburton/veta-trading-platform/commit/974fabdde799e073be2a9d7566cc576d020ed9fd))
- **sidebar:** add ARIA labels, roles and tooltips to workspace sidebar
  ([f3e4670](https://github.com/milesburton/veta-trading-platform/commit/f3e4670bd481dee11b95a22e5830dc6790ec5b93))
- **sidebar:** add view preset switcher for Trading, Analysis, Algo layouts
  ([8e9764e](https://github.com/milesburton/veta-trading-platform/commit/8e9764ee026440c8951ed1b2c6a7a29c8f7c5951))
- **sidebar:** pin/hover-expand, empty workspace state, full GUI persistence
  ([19bc3a4](https://github.com/milesburton/veta-trading-platform/commit/19bc3a425257b48fe6b24d0d0ba712c51102419d))
- **sidebar:** remove Views, pin icon, top-aligned New Workspace, right-click
  rename
  ([5682862](https://github.com/milesburton/veta-trading-platform/commit/5682862a38854af6a391c99ca05c4fe9c7f31bc9))
- SLA targets, data retention, Fly.io HA, and Electron polish
  ([55130d5](https://github.com/milesburton/veta-trading-platform/commit/55130d5573de91cbf27f12a2515121852e0da589))
- **sor:** implement real smart order router with per-venue books
  ([6b7beb9](https://github.com/milesburton/veta-trading-platform/commit/6b7beb9e39f6d38871e235bd0fc17f753dec23c8))
- Spin up all processes within the dev container and enable algo trading
  ([a2045c0](https://github.com/milesburton/veta-trading-platform/commit/a2045c0f3464bc1f54fd60bd0760882ffc3f9a76))
- **startup:** expand /ready check and overlay to cover all 14 services
  ([08909ad](https://github.com/milesburton/veta-trading-platform/commit/08909ad31dfc16632810c725a163da13b973638b))
- **storage:** migrate journal, fix-archive, user-service from SQLite to
  PostgreSQL
  ([8313946](https://github.com/milesburton/veta-trading-platform/commit/8313946d231c2df2046c305840ec6f81d672b466))
- **testing:** add FI E2E tests, trader personas, and FI workspace layouts
  ([e233829](https://github.com/milesburton/veta-trading-platform/commit/e233829b5f6c619b9f7e3ad5ed530943e3c5c12b))
- **toolbar:** remove Reset Layout button
  ([b2a081a](https://github.com/milesburton/veta-trading-platform/commit/b2a081a79982992ed8fc02e398b9f7fa514234b6))
- **ui:** add Observability and Traefik to service health panel with links
  ([18f8cbd](https://github.com/milesburton/veta-trading-platform/commit/18f8cbd17c9788547cf46251acd6c423d1b2da32))
- **ui:** add OrderProgressPanel and redesign default layout
  ([e4c5bf9](https://github.com/milesburton/veta-trading-platform/commit/e4c5bf9ef4b72213fac2c19656aa875c579c053f))
- **ui:** link decision log + fill tracker to selected order via channel
  ([a6b8489](https://github.com/milesburton/veta-trading-platform/commit/a6b8489c401e66d4fb6bf264253c1817ba1f7d7f))
- **ui:** reorganise chrome, channel defaults, clearer controls
  ([1091851](https://github.com/milesburton/veta-trading-platform/commit/109185176edfa6ca92c60e534a3d5360cd20c69f))
- **ui:** show error toast when workspace save fails
  ([066c47a](https://github.com/milesburton/veta-trading-platform/commit/066c47a2123a8be8ad1491ecf6936140f5d7e3c3))
- user auth, MiFID 2 journal, algo audit trail
  ([d4b67c6](https://github.com/milesburton/veta-trading-platform/commit/d4b67c6419ef0e87a854cd77e5e4cf5e51b0699e))
- **ux:** add explicit In/Out labels to channel pickers in tab headers
  ([bc2aa1f](https://github.com/milesburton/veta-trading-platform/commit/bc2aa1facfcacd3b89d36859d51ff117d9133561))
- **ux:** make selected/linked asset much more visible
  ([3733416](https://github.com/milesburton/veta-trading-platform/commit/373341631f624ecc693aee72d33f3383585bd35d))
- **ux:** panel purpose labels, chart fixes, per-user workspace isolation
  ([b9d6dc4](https://github.com/milesburton/veta-trading-platform/commit/b9d6dc426e1e2ad76eb1b03c3b72cb82afab7ac2))
- **workspace:** default admin users to Mission Control workspace on first login
  ([4afd1d9](https://github.com/milesburton/veta-trading-platform/commit/4afd1d9183cd68d3a4c2af281ab0a0ea2ae21a59))
- **workspace:** highlight globe icon green after sharing a workspace
  ([b54a63c](https://github.com/milesburton/veta-trading-platform/commit/b54a63c75a93633c6f3b9eb1f970be900285be3a))
- **workspace:** left-hand collapsible sidebar + fix news feeds
  ([d020205](https://github.com/milesburton/veta-trading-platform/commit/d0202051d5842499971cda41765e3ad854c0ea5d))
- **workspace:** pre-seed 4 preset workspaces; blank new workspaces; restore
  Clear Layout template
  ([eca3627](https://github.com/milesburton/veta-trading-platform/commit/eca3627c616ce59619c49752b6713bd5a97fc848))
- **workspace:** replace empty-workspace panel picker with layout template
  shortcuts
  ([2e873c0](https://github.com/milesburton/veta-trading-platform/commit/2e873c017b794323eb76932fdc1dd0b7792dc0ce))
- **workspaces:** restore missing preset workspaces on login
  ([07b2346](https://github.com/milesburton/veta-trading-platform/commit/07b23469d434ad8475d72283604c606f1c8205dc))
- **workspaces:** user-locking + remove redundant Live status badge
  ([759d0ea](https://github.com/milesburton/veta-trading-platform/commit/759d0ea33a11a4cce5c0501ee58e01103ed6f059))

### Bug Fixes

- add IS and Momentum algos to supervisord-fly.conf
  ([39db31f](https://github.com/milesburton/veta-trading-platform/commit/39db31f0223a0896325615141147a888dec6e19d))
- add PostgreSQL PGDG apt repo to Dockerfile for postgresql-16 install
  ([f0c056b](https://github.com/milesburton/veta-trading-platform/commit/f0c056b865010101159e06456d52b4de4542aa92))
- **alerts:** pin button uses ◇/◈ icon, adds panel to layout, focuses tab when
  pinned
  ([154cf52](https://github.com/milesburton/veta-trading-platform/commit/154cf52f7e2fca7089d207b49dc197979ff0a518))
- **alerts:** suppress toasts for alerts loaded from history on startup
  ([dcb64ca](https://github.com/milesburton/veta-trading-platform/commit/dcb64ca4432ef355b97d46b329a43bd157c88cb9))
- **algo:** add independent expiry sweep to all algo strategies; fix smoke test
  status polling
  ([9fb20f1](https://github.com/milesburton/veta-trading-platform/commit/9fb20f10339441b740829ce157140980084995a9))
- **algo:** add independent expiry sweep to iceberg and arrival-price strategies
  ([778015e](https://github.com/milesburton/veta-trading-platform/commit/778015e0162a477ddca4fb12a5c3b61b48c82bc0))
- **algos:** degrade gracefully when Redpanda unavailable instead of exiting
  ([006eeef](https://github.com/milesburton/veta-trading-platform/commit/006eeef89be68d07808dc8f10580c22c4f531a9e))
- **audit:** resolve all codebase review issues
  ([5632723](https://github.com/milesburton/veta-trading-platform/commit/5632723a7c09ce2ba72de1b3ae0d9903f9a4467d))
- avoid npx prompts for husky and lint-staged
  ([2b2858c](https://github.com/milesburton/veta-trading-platform/commit/2b2858c0f09c123afa07065652fd50c13e0b2f1c))
- **channels:** track MarketLadder selection locally; clean up comments
  ([b3a3619](https://github.com/milesburton/veta-trading-platform/commit/b3a361990b52c5ac458733ab70dbf19b6c4a6fcc))
- **chart:** auto-select first asset and always mark candlesReady on load
  ([3e6ddd0](https://github.com/milesburton/veta-trading-platform/commit/3e6ddd098edf4ad3676d97f8ec207d224c454040))
- **chart:** coordinate fitContent between resize and data effects
  ([79f006b](https://github.com/milesburton/veta-trading-platform/commit/79f006b9d98b2c0000573f5f008eee9829071c10))
- **chart:** correct volume scale and eliminate erratic full-replace redraws
  ([2031159](https://github.com/milesburton/veta-trading-platform/commit/2031159fe9d7eacfe990f2cb23c7f5a21d34ee9a))
- **chart:** defer initial setData until container has non-zero width
  ([c5f0aed](https://github.com/milesburton/veta-trading-platform/commit/c5f0aedbdbacd355d341acd7576733474d2667de))
- **chart:** fitContent after paint and allow single-candle render
  ([4ee1239](https://github.com/milesburton/veta-trading-platform/commit/4ee1239d96a01b52a3baf5383b6f0a74773277ea))
- **chart:** gate chart render on candlesReady; disable auto-open browser
  ([7ec760f](https://github.com/milesburton/veta-trading-platform/commit/7ec760f6cac443c8aa4713e17b38df15c2845ca4))
- **chart:** gate render on &gt;=2 bars; rename order blotter panel; remove
  comments
  ([162fa8c](https://github.com/milesburton/veta-trading-platform/commit/162fa8c944325e5b439471795c3d88740210fb73))
- **chart:** hide left price scale leaking volume overlay; remove news from
  trading layout
  ([5d05032](https://github.com/milesburton/veta-trading-platform/commit/5d050326055ea7ea1d0cb4de248a48f685b980b7))
- **chart:** pre-mark candlesReady on setAssets so chart renders immediately
  ([90ea85f](https://github.com/milesburton/veta-trading-platform/commit/90ea85f28ccc32f43b2647a39f9a7f79c4c038e4))
- **chart:** re-fit content after first live tick to prevent auto-scroll hiding
  history
  ([b335f79](https://github.com/milesburton/veta-trading-platform/commit/b335f799194aeedf95e006c4f762e7f8cdde274e))
- **chart:** remount on symbol change; restore candlesReady=false default
  ([b00f5c5](https://github.com/milesburton/veta-trading-platform/commit/b00f5c5c84a369ef35b38d633211dcc55ea15928))
- **chart:** replace live pre-seed candles with server bars to prevent giant
  candles on load
  ([b01d513](https://github.com/milesburton/veta-trading-platform/commit/b01d513a368850809b840aedf713dca807a54f3a))
- **chart:** replace ugly loading text with spinner
  ([51f7abb](https://github.com/milesburton/veta-trading-platform/commit/51f7abbd310ae796b9c8eddf28ce2d3e5b24ca90))
- **chart:** simplify fitContent to double-rAF, remove stale ResizeObserver
  coordination
  ([4d510c3](https://github.com/milesburton/veta-trading-platform/commit/4d510c3853d50646edaf12cdbf312a28818ad3bf))
- **chart:** trigger full setData when bar count jumps (seed arriving after live
  ticks)
  ([96e605a](https://github.com/milesburton/veta-trading-platform/commit/96e605a7ef7017a9e60494b38f6efbc4e0fda388))
- **ci:** align devcontainer base image to veta-trading-platform-base package
  ([ef66828](https://github.com/milesburton/veta-trading-platform/commit/ef66828fbab2e0abf9198ee4fbc8a53ce0e2f44f))
- **ci:** consume DELETE response body to fix Deno resource leak in integration
  test
  ([500bcbb](https://github.com/milesburton/veta-trading-platform/commit/500bcbb966b906fbe0f11e1068aff7053a964c1d))
- **ci:** correct Fly.io deploy — sftp compose files, resize VM, restart
  services
  ([fd40c6e](https://github.com/milesburton/veta-trading-platform/commit/fd40c6e83b5a2402ba32498bf6e0b84d32aa28da))
- **ci:** enable workflow PR permissions and suppress Node.js 20 warning
  ([a699068](https://github.com/milesburton/veta-trading-platform/commit/a699068373da203d6f8d61a2faa0cc3e4ab704f4))
- **ci:** fix ICEBERG/ARRIVAL_PRICE tests — bob lacks strategy permissions
  ([d37da97](https://github.com/milesburton/veta-trading-platform/commit/d37da97ef0e6ac0d42483da700a12984a689c504))
- **ci:** fix intelligence integration test failures
  ([1b2bbc9](https://github.com/milesburton/veta-trading-platform/commit/1b2bbc9357c907a67bdc1a1239db569f214568d3))
- **ci:** fix journal HTTP test response body leak
  ([24402c9](https://github.com/milesburton/veta-trading-platform/commit/24402c9ddaba9d020503e43a0d8e38691fc5699a))
- **ci:** fix market-data toggle test — check active not enabled
  ([29753f9](https://github.com/milesburton/veta-trading-platform/commit/29753f9752f1171ad1526d821d184b853d9a5f10))
- **ci:** fix migration ordering and add missing services to CI pipeline
  ([2f1cec8](https://github.com/milesburton/veta-trading-platform/commit/2f1cec8279ff2e54be7604b854dcce85b7499a1d))
- **ci:** fix price-triggered algo tests for CI cold start
  ([26af026](https://github.com/milesburton/veta-trading-platform/commit/26af0263174183ae1768da89dbe3c8ce7b347386))
- **ci:** increase algo integration test timeouts for GitHub Actions runner
  ([5e08583](https://github.com/milesburton/veta-trading-platform/commit/5e08583b8209084ae9f0f3a1bb79d224b0ff085d))
- **ci:** make MOMENTUM test deterministic via dual BUY+SELL orders
  ([bdf29ec](https://github.com/milesburton/veta-trading-platform/commit/bdf29ecce785397ff6633dd4492d15bb2af34e0e))
- **ci:** update tests and workflow to match current implementation
  ([b5e2b33](https://github.com/milesburton/veta-trading-platform/commit/b5e2b3317a36ed3ca3393e670ae98e0714097be5))
- commit missing candle-store.ts that was referenced in deno.json
  ([3bf321c](https://github.com/milesburton/veta-trading-platform/commit/3bf321c0d233df91b4842b8d8540bdced59d19f6))
- Corrected trader cli
  ([38a4f1a](https://github.com/milesburton/veta-trading-platform/commit/38a4f1aa17c3e08ad996ea35bd86a24004cbde9a))
- **dashboard:** eliminate liveLayout/layout split that caused stuck panels and
  gaps
  ([928341b](https://github.com/milesburton/veta-trading-platform/commit/928341b145a1babe425555e90ad1792137b2ee5d))
- **dashboard:** fix candlestick chart, tab title, and channel picker overlay
  ([1456cd1](https://github.com/milesburton/veta-trading-platform/commit/1456cd136c03d6f7f603e03168acef3785599106))
- **dashboard:** prevent panel jump on drag + E2E regression tests
  ([925541e](https://github.com/milesburton/veta-trading-platform/commit/925541e49e482e0dd8f83119219cac87d8992762))
- **dashboard:** prevent panels dropping on click
  ([963a535](https://github.com/milesburton/veta-trading-platform/commit/963a535e0779dcbae39ba4724e4c5564620f6386))
- **dashboard:** templates, drag, and stale layout for existing users
  ([0e5b427](https://github.com/milesburton/veta-trading-platform/commit/0e5b42717e4b7ba555d92c7684787f611d53ba1b))
- **deploy:** bypass glibc conflict for Redpanda on Fly.io; expand startup
  overlay
  ([16b58ec](https://github.com/milesburton/veta-trading-platform/commit/16b58ec36eb9a273fd908ba0b465e95cc0e83c6d))
- **deploy:** increase supervisord startretries and add unix socket for control
  ([50414eb](https://github.com/milesburton/veta-trading-platform/commit/50414eb0f2f14734b6c0c9b37b138f974c92093b))
- **deploy:** reduce VM to 256mb, add /health aggregate endpoint, extend grace
  period
  ([b801368](https://github.com/milesburton/veta-trading-platform/commit/b801368ab07b12d5701dc0260239dc1a39c57072))
- **deploy:** remove duplicate 'redpanda' subcommand in wrapper script
  ([b405ac5](https://github.com/milesburton/veta-trading-platform/commit/b405ac564fa25d81215167e8a549c8fa3c56bb26))
- **deploy:** restore supervisord newlines, bump VM to 512mb
  ([d3791e8](https://github.com/milesburton/veta-trading-platform/commit/d3791e8e6f765ae7fa1ae3b698ac9a90e2bdb316))
- **deploy:** run full backend stack on Fly.io via supervisord + Traefik
  ([d7653f0](https://github.com/milesburton/veta-trading-platform/commit/d7653f0c25ed1ab94113947e6ce9e7152deb1a1c))
- **deploy:** use COPY for redpanda wrapper script; fix Kafka config via YAML
  ([04fd4c5](https://github.com/milesburton/veta-trading-platform/commit/04fd4c580bae7184e8786f958494c0ab976692c7))
- **devcontainer,ci:** create docker group explicitly; fix ssh exec command
  ([74216d7](https://github.com/milesburton/veta-trading-platform/commit/74216d7f2b9a9cfe2b64c463a9443161e0d8ee7c))
- **devcontainer:** add socat proxy to stabilise VSCode port forwarding on port
  8080
  ([52a2648](https://github.com/milesburton/veta-trading-platform/commit/52a2648e880f8d6a8aca0a52f66180743672e215))
- **devcontainer:** inherit from base image, add db-migrate to supervisord
  ([d1e50a7](https://github.com/milesburton/veta-trading-platform/commit/d1e50a7e39d28e891789359648a1222136161152))
- **devcontainer:** run supervisord as root so postgres can setuid
  ([64b641b](https://github.com/milesburton/veta-trading-platform/commit/64b641bc2e55337842a02ac612f5db5216c9d671))
- **devcontainer:** source config.fish from live workspace, not baked copy
  ([299174b](https://github.com/milesburton/veta-trading-platform/commit/299174b21213508ad4f14fea1dd2e145aa0dae9e))
- **disk-monitor:** correct compose env vars and add host filesystem mount
  ([44f7ac7](https://github.com/milesburton/veta-trading-platform/commit/44f7ac7afb3264fa3917a59a4da31fdd1022fedb))
- **docker:** add zstd to apt deps for Ollama install script
  ([f3119c8](https://github.com/milesburton/veta-trading-platform/commit/f3119c848fda756342d5814d6b2d1fbfb1de09d6))
- **dockerfile:** add ca-certificates for curl HTTPS in debian image
  ([aecec1c](https://github.com/milesburton/veta-trading-platform/commit/aecec1c5581fb89ae678b5186de740642f507203))
- **dockerfile:** run deno install before deno cache to resolve npm imports
  ([910437f](https://github.com/milesburton/veta-trading-platform/commit/910437f6ac04d7386d6b11d5e8556ebde9d1f82a))
- **dockerfile:** switch to debian deno image to fix depot build
  ([10268f2](https://github.com/milesburton/veta-trading-platform/commit/10268f2c0082081be3db5471058095d2dedb946c))
- **dockerfile:** upgrade Deno to 2.7.1 for lockfile v5 support
  ([5533aac](https://github.com/milesburton/veta-trading-platform/commit/5533aac3c68d9e382ac96d1fbb5851a987000f4e))
- **dockerfile:** use deno cache instead of deno install for file-server
  ([e504d21](https://github.com/milesburton/veta-trading-platform/commit/e504d213d1401e1b8db991230e5a427791bcc0b9))
- **dockerfile:** use official deno alpine image for simpler runtime
  ([d27c90a](https://github.com/milesburton/veta-trading-platform/commit/d27c90ad727098e35379cb38324d8b5aa0553590))
- **docker:** remove non-existent backend/deno.json COPY from base image
  ([81cbddd](https://github.com/milesburton/veta-trading-platform/commit/81cbddd233a754843d6c2af9c370aa49c44abc1d))
- **e2e:** update GatewayMock to serve grid/query and fix blotter E2E tests
  ([2022d0a](https://github.com/milesburton/veta-trading-platform/commit/2022d0a378582f6d7ffbde452d17937cca68d974))
- **electron:** disable electron-builder auto-publish; release handled by
  workflow
  ([5938e9c](https://github.com/milesburton/veta-trading-platform/commit/5938e9c6be4284c6b917a621aeb2342d6ea749ba))
- **electron:** fix cross-platform release build for Windows/Linux/macOS
  ([7615386](https://github.com/milesburton/veta-trading-platform/commit/7615386ad159a1fe35e0b5390a7ae371cf1f2d02))
- **electron:** pass --publish never to electron-builder via CLI flag
  ([a636bb9](https://github.com/milesburton/veta-trading-platform/commit/a636bb9324bd99b563e2b62a656fa5331a8a160c))
- **fix-archive:** add 2s DB timeout to health check
  ([95c3a4d](https://github.com/milesburton/veta-trading-platform/commit/95c3a4d4f33c0ac7340e94a3309fe5ca935857d4))
- **fly:** add --yes to flyctl deploy to bypass interactive prompt
  ([7d057ad](https://github.com/milesburton/veta-trading-platform/commit/7d057adabe77377a385fa451ad68e0ea42b9f039))
- **fly:** add migration semaphore to prevent DB race on fresh deploy
  ([fab5ba8](https://github.com/milesburton/veta-trading-platform/commit/fab5ba8ad6e9393a30a9655268f3a2a6d498adb6))
- **fly:** bind Traefik on port 8080 instead of 80
  ([bd8903b](https://github.com/milesburton/veta-trading-platform/commit/bd8903b53d412c68cee4240203e759bf686a6fc0))
- **fly:** destroy old machine before deploy to clear stale volume attachments
  ([1f31462](https://github.com/milesburton/veta-trading-platform/commit/1f314621acce9fa15d3ce42e294c9803d2df3fbf))
- **fly:** fix postgres volume mount path and data dir
  ([5ab1247](https://github.com/milesburton/veta-trading-platform/commit/5ab1247d3ca8bdd06a6d9f4da51724d5470bb55a))
- **fly:** move frontend to port 3000, freeing 8080 for Traefik
  ([004c6e4](https://github.com/milesburton/veta-trading-platform/commit/004c6e4270e55bec32be15608074edbcff5ea968))
- **fly:** prevent OOM — mem_limit on all services, upgrade to performance-8x
  ([c25e2ac](https://github.com/milesburton/veta-trading-platform/commit/c25e2acd76113083e246cb576ac9e91789604858))
- **fly:** remove volume mounts + destroy all machines before deploy
  ([e93e8d5](https://github.com/milesburton/veta-trading-platform/commit/e93e8d540f5dad11327ba62bdbe59ab49e1e94fd))
- **fly:** remove volume mounts to unblock deploy
  ([9434599](https://github.com/milesburton/veta-trading-platform/commit/9434599d2b7aaa48ba55ca27b204ee1d30b7f59f))
- **frontend:** apply Biome auto-fixes to test files (literal keys, unsafe
  fixes)
  ([f057160](https://github.com/milesburton/veta-trading-platform/commit/f05716047710eefc5d55a02c6a9aaacdb2c647f4))
- **frontend:** clean lint/type issues and tests pass
  ([a5bced0](https://github.com/milesburton/veta-trading-platform/commit/a5bced0f23cd8983022ee102c68a577464cc8b85))
- **frontend:** resolve UI regressions, CI lint errors, and add grid regression
  tests
  ([81b46e6](https://github.com/milesburton/veta-trading-platform/commit/81b46e6f0f5833dd6ff0b18da0355792a629048c))
- **gateway,smoke:** forward Set-Cookie, add WS proxy, fix self-alias, extend
  timeouts
  ([32ca8ca](https://github.com/milesburton/veta-trading-platform/commit/32ca8caf5c16e7f3826117fae32457e94b9453c3))
- **gateway:** bump /ready health check timeout to 8s
  ([717cd88](https://github.com/milesburton/veta-trading-platform/commit/717cd888275ee1625d68e270741886d43ed04380))
- **gateway:** forward cookie header on preferences PUT to user-service
  ([28b6822](https://github.com/milesburton/veta-trading-platform/commit/28b6822f4bbe938c8bfc755167cd06324211c992))
- **gateway:** increase /ready health check timeout from 2s to 5s
  ([74b0fbc](https://github.com/milesburton/veta-trading-platform/commit/74b0fbc838934bcc0494892005b04cbc18cfeb5d))
- **gateway:** use EMS_HOST/OMS_HOST env vars in /ready check; add missing
  service hosts to homelab compose
  ([570fa92](https://github.com/milesburton/veta-trading-platform/commit/570fa92edc33b336c8e735794e7532148a1422c7))
- **grid:** expression builder dialog closes immediately on open
  ([0db7cc1](https://github.com/milesburton/veta-trading-platform/commit/0db7cc156cd17819c41cc3e7ec4c4e2988bbdca3))
- **heatmap:** match S&P 500 style; rename Admin to Mission Control
  ([7a9e24d](https://github.com/milesburton/veta-trading-platform/commit/7a9e24ddd34be50350123665de1511352677db6b))
- **homelab:** add healthchecks for traefik/redpanda-console, fix
  opensearch-init curl+dashboards URL
  ([4a73baf](https://github.com/milesburton/veta-trading-platform/commit/4a73bafc9726e7c4a88075f0574dfc3e336e02fd))
- **homelab:** add Traefik routes for all 25 backend services; cache migrate.ts
  in Docker image
  ([3d080ec](https://github.com/milesburton/veta-trading-platform/commit/3d080ec9bb38909747469c4685f967697cd9f5d0))
- **homelab:** correct GHCR image name and restore CI layer cache
  ([fbc92db](https://github.com/milesburton/veta-trading-platform/commit/fbc92db8e61040609878448f5b8f01edb6d9519b))
- **homelab:** fix Watchtower config — remove invalid NOTIFICATIONS env var,
  correct docker config path
  ([365a2f8](https://github.com/milesburton/veta-trading-platform/commit/365a2f883036914cce8b20dc970e96923e1edfca))
- **homelab:** remove strip-prefix from gateway-ws Traefik router
  ([391f289](https://github.com/milesburton/veta-trading-platform/commit/391f289a4e8ecd4bd7691150fe698b8e57b709bd))
- improve frontend user experience for Fly.io deployment
  ([de1eb6c](https://github.com/milesburton/veta-trading-platform/commit/de1eb6c8c72de73118cf65a7766d8681697eaf43))
- **infra:** add flyctl to devcontainer and right-size Fly.io VM
  ([e0e47d6](https://github.com/milesburton/veta-trading-platform/commit/e0e47d63f0a06a7e3bf345eebdbd7e5193bd647d))
- **infra:** add Postgres to devcontainer and supervisord; fix service proxies
  ([cf9a8a7](https://github.com/milesburton/veta-trading-platform/commit/cf9a8a71ca2fb8c250041eac908a074a461b41bf))
- install flyctl as deno user to avoid sudo prompts
  ([fba15f8](https://github.com/milesburton/veta-trading-platform/commit/fba15f8372b565394c46685354b8bcdead6ffa35))
- **integration-tests:** handle orderRejected event from unauthenticated WS in
  CI
  ([c86a054](https://github.com/milesburton/veta-trading-platform/commit/c86a054bb385b37dc8372476f16458dbf4b524e1))
- **integration-tests:** test market-sim/journal directly; relax WS auth
  assertion
  ([18cd129](https://github.com/milesburton/veta-trading-platform/commit/18cd12991b8e428929e8320f615f1b85ecfe0b1a))
- **journal:** expire pending/working orders past their expiresAt on
  reconstruction
  ([c7eddad](https://github.com/milesburton/veta-trading-platform/commit/c7eddad5aa4506b95ed2c54909a3617e16ce57dd))
- **journal:** reconcile missing fills from fix-archive on startup
  ([70c0015](https://github.com/milesburton/veta-trading-platform/commit/70c00154606ddc4e8642a3c4a53e123c493e5708))
- **journal:** transition parent order from pending→working on child/routed
  events
  ([a9e6b5c](https://github.com/milesburton/veta-trading-platform/commit/a9e6b5c0335672056efffdffb0440a08222c7a6d))
- **journal:** use clientOrderId as order record ID in hydration response
  ([c4cfe2b](https://github.com/milesburton/veta-trading-platform/commit/c4cfe2b9b616f49846f75c245340f2ba16b8d7e7))
- **keys:** move React list keys from &lt;tr&gt; to wrapping &lt;Fragment&gt;
  ([680a636](https://github.com/milesburton/veta-trading-platform/commit/680a636db732201973a5145fdf01853a97193037))
- **layout:** make template picker actually apply chosen layout
  ([e804aca](https://github.com/milesburton/veta-trading-platform/commit/e804aca701b3fe5e6e6ef6e492a9b74539d4ab85))
- **lint:** resolve biome errors and warnings missed before push
  ([fec6b94](https://github.com/milesburton/veta-trading-platform/commit/fec6b946cab6109d52dd97d81ef81e857cdf478e))
- Make sure the dev container can access the host machines' .ssh
  ([aff2a3d](https://github.com/milesburton/veta-trading-platform/commit/aff2a3d0e98e99f1a9f745ccdd22a7605ff36085))
- **market-depth:** realistic order book simulation and correct cumulative calc
  ([b14182e](https://github.com/milesburton/veta-trading-platform/commit/b14182e550fb3036bb4b23ca45881ba8f78dc7fd))
- **market-sim:** fix flat candlestick bodies by correcting volatility time
  scale
  ([6ee0696](https://github.com/milesburton/veta-trading-platform/commit/6ee069621f5f732b02208ac09e166df1f6f16f33))
- **market-sim:** increase tick rate to 4/s for fine-grained price movement
  ([a9dd45c](https://github.com/milesburton/veta-trading-platform/commit/a9dd45c1b692ea7e1b7c0b330b594957c5d5258f))
- **messaging:** make createConsumer non-blocking; connect Kafka in background
  ([3c18409](https://github.com/milesburton/veta-trading-platform/commit/3c1840920016f11b30bc8fc5f52a825137df02a3))
- **messaging:** retry createConsumer indefinitely on Redpanda startup failure
  ([e26ce2a](https://github.com/milesburton/veta-trading-platform/commit/e26ce2a70e9e4d35bd255eed37ba36ca8bd8cd42))
- **observability:** correct sqlite module version and DB mkdir path
  ([b397627](https://github.com/milesburton/veta-trading-platform/commit/b39762798aa89860ca16a7e5ecd4a833e90f71a8))
- **oms,ems:** degrade gracefully when Redpanda unavailable instead of exiting
  ([ae22a93](https://github.com/milesburton/veta-trading-platform/commit/ae22a9364311712253e3feb0f46970693d012ce2))
- **oms:** add periodic expiry sweep every 15s for orders missed by algo
  consumers
  ([772b9a7](https://github.com/milesburton/veta-trading-platform/commit/772b9a725919412a4fa30b9cb86ab71c4f1e9194))
- **oms:** publish orders.expired on startup for orphaned pending/working orders
  ([ca67680](https://github.com/milesburton/veta-trading-platform/commit/ca67680d58f1c5ece6e60a17d2fd3a2f4097565f))
- **opensearch-init:** use alpine/curl image, make connector registration
  non-fatal, fix dashboards base path
  ([47eacc2](https://github.com/milesburton/veta-trading-platform/commit/47eacc205ef4d834cf69c18a0903642460a0e2eb))
- **orders:** base parent fill status on accumulated qty, not child leavesQty
  ([9b0db60](https://github.com/milesburton/veta-trading-platform/commit/9b0db609224baa0f18927393b95c7cf954684525))
- **panel-dnd:** use module-level state to pass panel ID through drag
  ([f818c5b](https://github.com/milesburton/veta-trading-platform/commit/f818c5b409bb143453ae6a22bfe0f806d358fcd5))
- **playwright:** add allowed_desks and dark_pool_access to mock TradingLimits
  ([c83715d](https://github.com/milesburton/veta-trading-platform/commit/c83715d738e1033601b18b389ee056f47da363aa))
- **playwright:** grant derivatives desk access to DEFAULT_LIMITS in tests
  ([6b879e5](https://github.com/milesburton/veta-trading-platform/commit/6b879e53aaa3876216322dbd3d15d75e39066a7b))
- remove defunct Candle Store from platform status grid
  ([078123e](https://github.com/milesburton/veta-trading-platform/commit/078123e29c70c7483e2f468e32fcdacd8c6cd2b0))
- remove playwright --with-deps and auto-enable AI assistants
  ([74d1161](https://github.com/milesburton/veta-trading-platform/commit/74d1161c8a3912d728b75518d81058587dc1ceef))
- resolve biome linting errors and improve code quality
  ([f07fcce](https://github.com/milesburton/veta-trading-platform/commit/f07fcce23fb70c18e6537090710c2fd0737639ee))
- resolve biome linting issues and re-enable biome check in CI
  ([b29caad](https://github.com/milesburton/veta-trading-platform/commit/b29caadb874cbfed2484eed348f247be81e26882))
- resolve TypeScript build errors and disable auto-open browser
  ([a64e712](https://github.com/milesburton/veta-trading-platform/commit/a64e7122a732a603dbe1be7656fda08bebe310a9))
- **sidebar:** hide workspace list when only one workspace exists; remove inline
  comments
  ([937ea96](https://github.com/milesburton/veta-trading-platform/commit/937ea96cc7384156186048f5d44ea08d27b84514))
- **sidebar:** replace Clear Layout with Market Overview in view presets
  ([9708c54](https://github.com/milesburton/veta-trading-platform/commit/9708c54101a69132cb40ab9dd6f77a07c5062b3f))
- skip npm lifecycle hooks during devcontainer setup
  ([e1cad48](https://github.com/milesburton/veta-trading-platform/commit/e1cad480ce80da50cbd1856656bde738719444c5))
- **smoke-tests:** handle unauthenticated CI context; test upstream services
  directly
  ([ecace40](https://github.com/milesburton/veta-trading-platform/commit/ecace405d17e41693165a4f12d3aaf894bb59510))
- **smoke,gateway:** fix 4 failing smoke tests
  ([1ef5a23](https://github.com/milesburton/veta-trading-platform/commit/1ef5a23485e1a7a3e51064eafdaea39fa1104baf))
- **smoke:** await WebSocket close to prevent Deno resource leak errors
  ([6fcbebc](https://github.com/milesburton/veta-trading-platform/commit/6fcbebc98ab869c740e16ef2b3e7574e86c83d58))
- **smoke:** fix rfq-service routing and ccp stats field names
  ([023075c](https://github.com/milesburton/veta-trading-platform/commit/023075c35a01ffb71355f5eae8163a2e6e6e1841))
- **smoke:** use alice for ARRIVAL_PRICE test — bob lacks that strategy
  permission
  ([cbbc468](https://github.com/milesburton/veta-trading-platform/commit/cbbc46818050a99af1f83c73f3644d693fde4314))
- subscribe to orders.routed + transition to 'working' on both events.
  ([a9e6b5c](https://github.com/milesburton/veta-trading-platform/commit/a9e6b5c0335672056efffdffb0440a08222c7a6d))
- **supervisord:** remove COMMIT_SHA interpolation from environment
  ([0d7bbb9](https://github.com/milesburton/veta-trading-platform/commit/0d7bbb90dc0405107f5e9f36461df1c6774d6b08))
- **tests:** correct orderId type assertion in integration tests
  ([ff26ae0](https://github.com/milesburton/veta-trading-platform/commit/ff26ae02a0bec031485ccb049113fad8c41f649f))
- **tests:** correct playwright tab-drag assertion to use tab_button count
  ([9decff1](https://github.com/milesburton/veta-trading-platform/commit/9decff12b6666b69bba29fcc6bf5cf6dddf80f81))
- **tests:** fix all failing Playwright E2E tests for CI
  ([90f9fb0](https://github.com/milesburton/veta-trading-platform/commit/90f9fb08be7709c7ccbda7d3a1f8fc83c2cfe9db))
- **tests:** update OrderTicket tests to match current component API
  ([2f965d2](https://github.com/milesburton/veta-trading-platform/commit/2f965d2dc27cc6af713d6525b40464d033c4462e))
- **types:** commit all accumulated local changes to unblock CI
  ([a5ebbef](https://github.com/milesburton/veta-trading-platform/commit/a5ebbef5b22e222475d8ea6555347cea5dd2a6c8))
- **ui:** candlestick rendering and show algo child fills
  ([447110b](https://github.com/milesburton/veta-trading-platform/commit/447110b74e244e1119625a1ae40424195b6ca4ba))
- **ui:** improve dark mode text contrast + add robots.txt
  ([71a1f8a](https://github.com/milesburton/veta-trading-platform/commit/71a1f8a8dcba289ed1e1f250e06cb1e6a7dbf183))
- **ui:** treat Traefik as optional — exclude from aggregate health status
  ([7197e37](https://github.com/milesburton/veta-trading-platform/commit/7197e37cf1ee09a15dc9270d247faa20f39c5fe1))
- use npx to run biome in CI instead of deno
  ([c82f22f](https://github.com/milesburton/veta-trading-platform/commit/c82f22fb8b855d28f2d21e1688298b0d6d9c9fd8))
- use trust auth for initdb to avoid superuser password requirement
  ([bc17548](https://github.com/milesburton/veta-trading-platform/commit/bc1754833117f0404e406ac8347a5c83c85aca41))
- **ux:** show bracket purpose on symbol-linked panel tabs
  ([e9d330c](https://github.com/milesburton/veta-trading-platform/commit/e9d330c9c55a58f4f3066f907ba870048ee308c3))
- wire FIX Archive and Kafka Relay into Traefik; remove incorrect optional flags
  ([f2ffc81](https://github.com/milesburton/veta-trading-platform/commit/f2ffc81a661ff91e93be790f896736e34766310a))
- **workspace:** convert signal state to useState so tab switching re-renders
  correctly
  ([066bb4c](https://github.com/milesburton/veta-trading-platform/commit/066bb4c53e56fc8eb0b9078bd726a362fc501f6d))
- **workspace:** create and persist layout for newly added workspaces
  ([011e562](https://github.com/milesburton/veta-trading-platform/commit/011e5621c9faf482b0e13b5eb7c4df3d69da2735))
- **workspace:** eliminate race condition in saveWorkspacePrefs
  ([d736e58](https://github.com/milesburton/veta-trading-platform/commit/d736e580116a79eed8c43f3caa456b53ef7c0ee8))
- **workspace:** make share and delete icons more visible on hover
  ([3f03be2](https://github.com/milesburton/veta-trading-platform/commit/3f03be2cf0e1b34c7d8be158f826dd08379f071a))
- **workspace:** replace share/delete icons with SVGs for better visibility
  ([c8c7094](https://github.com/milesburton/veta-trading-platform/commit/c8c7094f3dbbea1b17f516b5d6f1ff92ae63c4e1))
- **workspace:** resolve empty workspace on startup and restore active workspace
  ([e17af1b](https://github.com/milesburton/veta-trading-platform/commit/e17af1b6a10d9394e9c8a23b43cb0bdf415768a1))
- **workspace:** seed layouts state from defaults to prevent empty workspace
  flash
  ([f827b2f](https://github.com/milesburton/veta-trading-platform/commit/f827b2f275f4c67f8adc486bc5ed1eb56245c766))
- **workspaces:** prevent workspace loss on rapid edit + refresh
  ([a8d259f](https://github.com/milesburton/veta-trading-platform/commit/a8d259fd7fe307a0adf33d72d74bcc5e933e300e))
- **workspace:** tab click no longer blocked by stopPropagation
  ([efa6e39](https://github.com/milesburton/veta-trading-platform/commit/efa6e39e056b56a1c84e570b676a1830d63b4057))

### Performance Improvements

- eliminate per-tick array allocations and reduce Redux render frequency
  ([c82695f](https://github.com/milesburton/veta-trading-platform/commit/c82695ff70c396916318cbb15dbe750d4ce045c0))
- **market-ladder:** replace Recharts sparklines with canvas renderer
  ([a4e3afb](https://github.com/milesburton/veta-trading-platform/commit/a4e3afb27bea9ca14e5429c2242bc7792a650aff))
- remove order hydration into Redux; size grid queries to panel height
  ([f1252f9](https://github.com/milesburton/veta-trading-platform/commit/f1252f9c90cbe23ac11b27407193d91454635b1b))
- ship observability events via web worker with 1s batching
  ([3c85275](https://github.com/milesburton/veta-trading-platform/commit/3c852750582bb3ad75f3a90f46e97022e45e7bbc))
- stop shipping high-frequency market actions to observability; cap orders at
  500
  ([433f653](https://github.com/milesburton/veta-trading-platform/commit/433f653ac34dc0684c99392c3d3658aab1233bbf))
