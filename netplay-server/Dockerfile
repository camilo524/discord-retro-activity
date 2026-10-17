FROM rust:1-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:stable-slim
COPY --from=build /app/target/release/rust-socket-server /usr/local/bin/netplay
ENV PORT=3000
EXPOSE 3000
CMD ["netplay"]
