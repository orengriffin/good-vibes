# after running "offline.sh"
curl -X POST -H "Content-Type: application/json" -d @callbackQuery.json http://localhost:3000/post-message
