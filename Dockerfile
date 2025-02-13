# Use official bun image for the builder
FROM --platform=$BUILDPLATFORM oven/bun:1.2.2 AS builder

# Set up arguments for targeting builds
ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Compile as a binary for the target architecture 
RUN case "$TARGETPLATFORM" in \
    "linux/amd64") TARGET="bun-linux-x64-baseline" ;; \
    "linux/arm64") TARGET="bun-linux-arm64" ;; \
    *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
    esac && \
    bun build --compile --minify --sourcemap ./index.ts --target $TARGET --outfile server

# Use a minimal distroless image for the final stage
# Pinned to digest from 13 Feb 2025
FROM cgr.dev/chainguard/glibc-dynamic@sha256:c907cf5576de12bb54ac2580a91d0287de55f56bce4ddd66a0edf5ebaba9feed

# Copy the compiled binary
COPY --from=builder /app/server /server

# Run the binary directly
EXPOSE 3000
CMD ["/server"]
