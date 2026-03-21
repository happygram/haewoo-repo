FROM golang:1.25-alpine AS build

WORKDIR /app
COPY go.mod ./
RUN go mod download

COPY . .
RUN go build -o server .

FROM alpine:3.21
WORKDIR /app
COPY --from=build /app/server /app/server

ENV PORT=3001
EXPOSE 3001

CMD ["/app/server"]
