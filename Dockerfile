# Use official bun image for the builder
FROM --platform=$BUILDPLATFORM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS builder

# Set up arguments for targeting builds
ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

RUN bun run typecheck && bun test

# Compile as a binary for the target architecture 
RUN case "$TARGETPLATFORM" in \
    "linux/amd64") TARGET="bun-linux-x64-baseline" ;; \
    "linux/arm64") TARGET="bun-linux-arm64" ;; \
    *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
    esac && \
    bun build --compile --minify --sourcemap ./index.ts --target $TARGET --outfile server

# Use a minimal distroless image for the final stage
# Pinned to digest from 23 Oct 2026
FROM cgr.dev/chainguard/glibc-dynamic@sha256:00696e56634cf72d966ee0e0f26224c83a192569035caf1e31297f77b0e85212

# Copy the compiled binary
COPY --from=builder /app/server /server

# Run the binary directly
EXPOSE 3000
CMD ["/server"]
