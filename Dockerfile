# syntax=docker/dockerfile:1
# check=error=true
# Literal tag (not an ARG) so Dependabot can bump it; bin/ci-parity checks it against .ruby-version.
FROM docker.io/library/ruby:3.4.11-slim AS base
WORKDIR /rails
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libjemalloc2 libpq5 postgresql-client && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives
ENV RAILS_ENV="production" BUNDLE_DEPLOYMENT="1" BUNDLE_PATH="/usr/local/bundle" BUNDLE_WITHOUT="development:test" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so" RAILS_SERVE_STATIC_FILES="true" RAILS_LOG_TO_STDOUT="true" SOLID_QUEUE_IN_PUMA="true"

FROM base AS build
RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives
COPY --from=docker.io/library/node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=docker.io/library/node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY .ruby-version Gemfile Gemfile.lock ./
RUN bundle install && rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile --gemfile
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN chmod +x bin/fly-start bin/docker-entrypoint && bundle exec bootsnap precompile app/ lib/
# vite_rails hooks `assets:precompile` into the Vite build (output: public/vite). No real secrets are needed to build.
RUN SECRET_KEY_BASE_DUMMY=1 DATABASE_URL=postgres://build:build@127.0.0.1/build \
    AR_ENCRYPTION_PRIMARY_KEY=build AR_ENCRYPTION_DETERMINISTIC_KEY=build AR_ENCRYPTION_KEY_DERIVATION_SALT=build \
    ./bin/rails assets:precompile && rm -rf node_modules && \
    find public/vite -name '*.map' -delete   # never serve source maps publicly

FROM base
RUN groupadd --system --gid 1000 rails && useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash
USER 1000:1000
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails
ENTRYPOINT ["/rails/bin/docker-entrypoint"]
EXPOSE 8080
CMD ["./bin/fly-start"]
