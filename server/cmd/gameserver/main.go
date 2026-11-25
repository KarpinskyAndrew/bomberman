package main

import (
	"log"
	"net/http"

	"github.com/KarpinskyAndrew/bomberman/server/internal/transport/ws"
)

func main() {

	mux := http.NewServeMux()
	mux.HandleFunc("GET /play", ws.Play)

	log.Println("gameserver listening on :8081")
	log.Fatal(http.ListenAndServe(":8081", mux))

}
