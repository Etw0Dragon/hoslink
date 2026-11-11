FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -buildvcs=false -trimpath -o /server ./cmd/server
FROM alpine:3.23
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /server /app/server
RUN mkdir -p /app/var/mail && chown -R app:app /app
USER app
EXPOSE 8080
ENTRYPOINT ["/app/server"]
