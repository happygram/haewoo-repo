package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Hall struct {
	ID        string    `gorm:"primaryKey;size:64" json:"id"`
	Name      string    `gorm:"not null;type:text" json:"name"`
	IsActive  bool      `gorm:"not null;default:true;index" json:"isActive"`
	Rooms     []Room    `gorm:"constraint:OnDelete:CASCADE;" json:"rooms"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

type Room struct {
	ID          string `gorm:"primaryKey;size:64" json:"id"`
	HallID      string `gorm:"index;not null" json:"hallId"`
	Hall        Hall   `gorm:"constraint:OnDelete:CASCADE;foreignKey:HallID" json:"-"`
	Name        string `gorm:"not null;type:text" json:"name"`
	IsActive    bool   `gorm:"not null;default:true;index" json:"isActive"`
	DisplaySize string `gorm:"not null;default:INCH27" json:"displaySize"`

	// 빈소 LED에서 표시할 슬라이드 1개를 지정합니다.
	ActiveSlideID *string `gorm:"index" json:"activeSlideId"`

	Slides []Slide `gorm:"constraint:OnDelete:CASCADE;" json:"slides"`

	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

type Slide struct {
	ID        string    `gorm:"primaryKey;size:64" json:"id"`
	RoomID    string    `gorm:"index;not null" json:"roomId"`
	Room      Room      `gorm:"constraint:OnDelete:CASCADE;foreignKey:RoomID" json:"-"`
	S3Key     string    `gorm:"not null" json:"s3Key"`
	ImageURL  string    `gorm:"not null" json:"imageUrl"`
	Caption   *string   `gorm:"type:text" json:"caption"`
	SortOrder int       `gorm:"index;default:0" json:"sortOrder"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

type configData struct {
	Port            int
	AdminUsername   string
	AdminPassword   string
	JWTSecret       string
	DatabaseURL     string
	AWSRegion       string
	S3Bucket        string
	ImagePublicBase string
	S3              *s3.Client
}

func mustEnv(key string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		log.Fatalf("missing env var: %s", key)
	}
	return v
}

func loadDotEnvIfExists(dotEnvPath string) {
	// 외부 의존성 없이 동작하는 간단 .env 로더입니다.
	// 이미 환경변수로 세팅된 값은 덮어쓰지 않습니다.
	if _, err := os.Stat(dotEnvPath); err != nil {
		return
	}

	f, err := os.Open(dotEnvPath)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		kv := strings.SplitN(line, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.TrimSpace(kv[0])
		val := strings.TrimSpace(kv[1])
		if key == "" {
			continue
		}
		if os.Getenv(key) != "" {
			continue
		}
		// 따옴표로 감싸져 있으면 제거합니다.
		val = strings.TrimPrefix(val, "\"")
		val = strings.TrimSuffix(val, "\"")
		val = strings.TrimPrefix(val, "'")
		val = strings.TrimSuffix(val, "'")
		_ = os.Setenv(key, val)
	}
}

func safeFileName(original string) string {
	// object key에 영향을 주는 문자를 '_'로 치환합니다.
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '.' || r == '_' || r == '-':
			return r
		default:
			return '_'
		}
	}, original)
}

func signAdminJwt(username, secret string) (string, error) {
	claims := jwt.MapClaims{
		"sub": username,
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(secret))
}

func authAdminMiddleware(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Get("Authorization")
			if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
				http.Error(w, `{"error":"Missing token"}`, http.StatusUnauthorized)
				return
			}
			tokenStr := strings.TrimPrefix(auth, "Bearer ")

			parsed, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
				if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
					return nil, fmt.Errorf("unexpected signing method: %s", token.Header["alg"])
				}
				return []byte(jwtSecret), nil
			})
			if err != nil || !parsed.Valid {
				http.Error(w, `{"error":"Invalid token"}`, http.StatusUnauthorized)
				return
			}

			claims, ok := parsed.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"error":"Invalid token claims"}`, http.StatusUnauthorized)
				return
			}
			sub, _ := claims["sub"].(string)
			if sub == "" {
				http.Error(w, `{"error":"Invalid token sub"}`, http.StatusUnauthorized)
				return
			}

			// next 핸들러에서 쓸 수 있게 context에 넣습니다.
			ctx := context.WithValue(r.Context(), "admin", sub)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func jsonResponse(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	_ = enc.Encode(payload)
}

func deleteS3Object(ctx context.Context, client *s3.Client, bucket, key string) {
	if client == nil || strings.TrimSpace(bucket) == "" || strings.TrimSpace(key) == "" {
		return
	}
	_, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		log.Printf("s3 delete %s: %v", key, err)
	}
}

func clearActiveSlideIfMatch(db *gorm.DB, roomID, slideID string) {
	var room Room
	if err := db.First(&room, "id = ?", roomID).Error; err != nil {
		return
	}
	if room.ActiveSlideID != nil && *room.ActiveSlideID == slideID {
		_ = db.Model(&Room{}).Where("id = ?", roomID).Update("active_slide_id", nil).Error
	}
}

func deleteSlideAndObject(ctx context.Context, db *gorm.DB, cfg *configData, roomID, slideID string) error {
	var slide Slide
	if err := db.First(&slide, "id = ? AND room_id = ?", slideID, roomID).Error; err != nil {
		return err
	}
	clearActiveSlideIfMatch(db, roomID, slide.ID)
	deleteS3Object(ctx, cfg.S3, cfg.S3Bucket, slide.S3Key)
	return db.Delete(&Slide{}, "id = ?", slide.ID).Error
}

func deleteAllSlidesInRoom(ctx context.Context, db *gorm.DB, cfg *configData, roomID string) error {
	_ = db.Model(&Room{}).Where("id = ?", roomID).Update("active_slide_id", nil).Error
	var slides []Slide
	if err := db.Where("room_id = ?", roomID).Find(&slides).Error; err != nil {
		return err
	}
	for _, s := range slides {
		deleteS3Object(ctx, cfg.S3, cfg.S3Bucket, s.S3Key)
		if err := db.Delete(&Slide{}, "id = ?", s.ID).Error; err != nil {
			return err
		}
	}
	return nil
}

func main() {
	// go run . 실행 위치에 있는 .env를 자동 로드합니다.
	// (예: source/backend/.env)
	loadDotEnvIfExists("./.env")

	port := 3001
	if p := strings.TrimSpace(os.Getenv("PORT")); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil {
			log.Fatalf("invalid PORT: %v", err)
		}
		port = n
	}

	adminUsername := mustEnv("ADMIN_USERNAME")
	adminPassword := mustEnv("ADMIN_PASSWORD")
	jwtSecret := mustEnv("JWT_SECRET")
	databaseURL := mustEnv("DATABASE_URL")

	awsRegion := os.Getenv("AWS_REGION")
	if strings.TrimSpace(awsRegion) == "" {
		awsRegion = "ap-northeast-2"
	}
	s3Bucket := os.Getenv("S3_BUCKET")
	imagePublicBase := strings.TrimSpace(os.Getenv("IMAGE_PUBLIC_BASE"))
	if imagePublicBase == "" {
		imagePublicBase = fmt.Sprintf("http://localhost:%d", port)
	}

	corsAllowOrigin := strings.TrimSpace(os.Getenv("CORS_ALLOW_ORIGIN"))
	if corsAllowOrigin == "" {
		corsAllowOrigin = "*"
	}

	awsCfg, err := config.LoadDefaultConfig(context.Background(), config.WithRegion(awsRegion))
	if err != nil {
		log.Fatalf("failed to load aws config: %v", err)
	}
	s3Client := s3.NewFromConfig(awsCfg)

	cfg := configData{
		Port:            port,
		AdminUsername:   adminUsername,
		AdminPassword:   adminPassword,
		JWTSecret:       jwtSecret,
		DatabaseURL:     databaseURL,
		AWSRegion:       awsRegion,
		S3Bucket:        s3Bucket,
		ImagePublicBase: imagePublicBase,
		S3:              s3Client,
	}

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	// 운영에서는 마이그레이션 도구로 관리하는 것을 권장합니다.
	_ = db.AutoMigrate(&Hall{}, &Room{}, &Slide{})

	r := chi.NewRouter()
	// 브라우저에서 프론트엔드(다른 도메인/포트) -> API 요청이 막히지 않도록 최소 CORS를 추가합니다.
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", corsAllowOrigin)
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			if req.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, req)
		})
	})
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(middleware.AllowContentType("application/json", "application/x-www-form-urlencoded", "multipart/form-data"))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, http.StatusOK, map[string]any{"ok": true})
	})

	r.Route("/api", func(api chi.Router) {
		// =========================
		// Admin login
		// =========================
		api.Post("/admin/login", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Username string `json:"username"`
				Password string `json:"password"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
				return
			}
			if body.Username != cfg.AdminUsername || body.Password != cfg.AdminPassword {
				http.Error(w, `{"error":"Invalid credentials"}`, http.StatusUnauthorized)
				return
			}
			token, err := signAdminJwt(cfg.AdminUsername, cfg.JWTSecret)
			if err != nil {
				http.Error(w, `{"error":"Token error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"token": token})
		})

		secured := api.Group(func(ar chi.Router) {
			ar.Use(authAdminMiddleware(cfg.JWTSecret))
		})

		// =========================
		// Halls
		// =========================
		secured.Get("/halls", func(w http.ResponseWriter, r *http.Request) {
			var halls []Hall
			if err := db.Preload("Rooms").Order("created_at desc").Find(&halls).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"halls": halls})
		})

		secured.Post("/halls", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Name string `json:"name"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
				return
			}
			if strings.TrimSpace(body.Name) == "" {
				http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
				return
			}
			h := Hall{ID: uuid.NewString(), Name: body.Name}
			if err := db.Create(&h).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"hall": h})
		})

		// =========================
		// Rooms
		// =========================
		secured.Get("/rooms", func(w http.ResponseWriter, r *http.Request) {
			hallId := strings.TrimSpace(r.URL.Query().Get("hallId"))
			var rooms []Room
			q := db.Order("created_at desc")
			if hallId != "" {
				q = q.Where("hall_id = ?", hallId)
			}
			if err := q.Find(&rooms).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"rooms": rooms})
		})

		secured.Post("/rooms", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				HallID      string `json:"hallId"`
				Name        string `json:"name"`
				DisplaySize string `json:"displaySize"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
				return
			}
			if strings.TrimSpace(body.HallID) == "" || strings.TrimSpace(body.Name) == "" {
				http.Error(w, `{"error":"hallId, name are required"}`, http.StatusBadRequest)
				return
			}

			var hall Hall
			if err := db.First(&hall, "id = ?", strings.TrimSpace(body.HallID)).Error; err != nil {
				http.Error(w, `{"error":"hall not found"}`, http.StatusNotFound)
				return
			}
			if !hall.IsActive {
				http.Error(w, `{"error":"hall is inactive"}`, http.StatusBadRequest)
				return
			}

			displaySize := "INCH27"
			if body.DisplaySize == "INCH32" {
				displaySize = "INCH32"
			}

			room := Room{
				ID:          uuid.NewString(),
				HallID:      body.HallID,
				Name:        body.Name,
				DisplaySize: displaySize,
			}
			if err := db.Create(&room).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"room": room})
		})

		secured.Patch("/halls/{hallId}", func(w http.ResponseWriter, r *http.Request) {
			hallID := chi.URLParam(r, "hallId")
			var body struct {
				Name     *string `json:"name"`
				IsActive *bool   `json:"isActive"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
				return
			}
			var hall Hall
			if err := db.First(&hall, "id = ?", hallID).Error; err != nil {
				http.Error(w, `{"error":"hall not found"}`, http.StatusNotFound)
				return
			}
			if body.Name != nil {
				if strings.TrimSpace(*body.Name) == "" {
					http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
					return
				}
				hall.Name = strings.TrimSpace(*body.Name)
			}
			if body.IsActive != nil {
				hall.IsActive = *body.IsActive
				if !hall.IsActive {
					_ = db.Model(&Room{}).Where("hall_id = ?", hallID).Update("is_active", false).Error
				} else {
					_ = db.Model(&Room{}).Where("hall_id = ?", hallID).Update("is_active", true).Error
				}
			}
			if err := db.Save(&hall).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"hall": hall})
		})

		secured.Delete("/halls/{hallId}", func(w http.ResponseWriter, r *http.Request) {
			hallID := chi.URLParam(r, "hallId")
			var rooms []Room
			if err := db.Where("hall_id = ?", hallID).Find(&rooms).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			ctx := r.Context()
			for _, rm := range rooms {
				if err := deleteAllSlidesInRoom(ctx, db, &cfg, rm.ID); err != nil {
					http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
					return
				}
				if err := db.Delete(&Room{}, "id = ?", rm.ID).Error; err != nil {
					http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
					return
				}
			}
			if err := db.Delete(&Hall{}, "id = ?", hallID).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"ok": true})
		})

		secured.Patch("/rooms/{roomId}", func(w http.ResponseWriter, r *http.Request) {
			roomID := chi.URLParam(r, "roomId")
			var body struct {
				Name        *string `json:"name"`
				DisplaySize *string `json:"displaySize"`
				IsActive    *bool   `json:"isActive"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
				return
			}
			var room Room
			if err := db.First(&room, "id = ?", roomID).Error; err != nil {
				http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
				return
			}
			if body.Name != nil {
				if strings.TrimSpace(*body.Name) == "" {
					http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
					return
				}
				room.Name = strings.TrimSpace(*body.Name)
			}
			if body.DisplaySize != nil {
				ds := strings.TrimSpace(*body.DisplaySize)
				if ds != "INCH27" && ds != "INCH32" {
					http.Error(w, `{"error":"invalid displaySize"}`, http.StatusBadRequest)
					return
				}
				room.DisplaySize = ds
			}
			if body.IsActive != nil {
				room.IsActive = *body.IsActive
			}
			if err := db.Save(&room).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"room": room})
		})

		secured.Delete("/rooms/{roomId}", func(w http.ResponseWriter, r *http.Request) {
			roomID := chi.URLParam(r, "roomId")
			ctx := r.Context()
			if err := deleteAllSlidesInRoom(ctx, db, &cfg, roomID); err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			if err := db.Delete(&Room{}, "id = ?", roomID).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"ok": true})
		})

		// =========================
		// Hall slides (imageUrl 목록)
		// =========================
		secured.Get("/halls/{hallId}/slides", func(w http.ResponseWriter, r *http.Request) {
			hallId := chi.URLParam(r, "hallId")

			var rooms []Room
			if err := db.Where("hall_id = ?", hallId).Find(&rooms).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}

			roomIds := make([]string, 0, len(rooms))
			roomMeta := map[string]map[string]any{}
			for _, room := range rooms {
				roomIds = append(roomIds, room.ID)
				roomMeta[room.ID] = map[string]any{
					"roomName":    room.Name,
					"displaySize": room.DisplaySize,
				}
			}

			if len(roomIds) == 0 {
				jsonResponse(w, http.StatusOK, map[string]any{"slides": []any{}})
				return
			}

			var slides []Slide
			if err := db.Where("room_id IN ?", roomIds).
				Order("sort_order asc").
				Find(&slides).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}

			type hallSlideOut struct {
				ID          string  `json:"id"`
				RoomID      string  `json:"roomId"`
				RoomName    string  `json:"roomName"`
				DisplaySize string  `json:"displaySize"`
				ImageURL    string  `json:"imageUrl"`
				Caption     *string `json:"caption"`
				SortOrder   int     `json:"sortOrder"`
			}

			out := make([]hallSlideOut, 0, len(slides))
			for _, s := range slides {
				meta := roomMeta[s.RoomID]
				out = append(out, hallSlideOut{
					ID:          s.ID,
					RoomID:      s.RoomID,
					RoomName:    meta["roomName"].(string),
					DisplaySize: meta["displaySize"].(string),
					ImageURL:    s.ImageURL,
					Caption:     s.Caption,
					SortOrder:   s.SortOrder,
				})
			}

			jsonResponse(w, http.StatusOK, map[string]any{"slides": out})
		})

		// =========================
		// Room slides (이미지 URL 목록 + activeSlideId)
		// =========================
		secured.Get("/rooms/{roomId}/slides", func(w http.ResponseWriter, r *http.Request) {
			roomId := chi.URLParam(r, "roomId")

			var room Room
			if err := db.First(&room, "id = ?", roomId).Error; err != nil {
				http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
				return
			}

			var slides []Slide
			if err := db.
				Where("room_id = ?", room.ID).
				Order("sort_order asc").
				Find(&slides).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}

			type slideOut struct {
				ID        string  `json:"id"`
				ImageURL  string  `json:"imageUrl"`
				Caption   *string `json:"caption"`
				SortOrder int     `json:"sortOrder"`
			}

			out := make([]slideOut, 0, len(slides))
			for _, s := range slides {
				out = append(out, slideOut{
					ID:        s.ID,
					ImageURL:  s.ImageURL,
					Caption:   s.Caption,
					SortOrder: s.SortOrder,
				})
			}

			jsonResponse(w, http.StatusOK, map[string]any{
				"activeSlideId": room.ActiveSlideID,
				"slides":        out,
			})
		})

		// =========================
		// Room active slide 지정
		// =========================
		secured.Post("/rooms/{roomId}/active-slide", func(w http.ResponseWriter, r *http.Request) {
			roomId := chi.URLParam(r, "roomId")

			var body struct {
				SlideID string `json:"slideId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, `{"error":"Invalid JSON"}`, http.StatusBadRequest)
				return
			}
			if strings.TrimSpace(body.SlideID) == "" {
				http.Error(w, `{"error":"slideId is required"}`, http.StatusBadRequest)
				return
			}

			// 해당 슬라이드가 해당 room에 속하는지 확인
			var slide Slide
			if err := db.First(&slide, "id = ? AND room_id = ?", body.SlideID, roomId).Error; err != nil {
				http.Error(w, `{"error":"slide not found for room"}`, http.StatusNotFound)
				return
			}

			if err := db.Model(&Room{}).Where("id = ?", roomId).Update("active_slide_id", body.SlideID).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}

			jsonResponse(w, http.StatusOK, map[string]any{
				"activeSlideId": body.SlideID,
			})
		})

		// =========================
		// Slides upload
		// =========================
		secured.Post("/rooms/{roomId}/slides/upload", func(w http.ResponseWriter, r *http.Request) {
			roomId := chi.URLParam(r, "roomId")

			var roomForUpload Room
			if err := db.First(&roomForUpload, "id = ?", roomId).Error; err != nil {
				http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
				return
			}
			var hallForUpload Hall
			if err := db.First(&hallForUpload, "id = ?", roomForUpload.HallID).Error; err != nil {
				http.Error(w, `{"error":"hall not found"}`, http.StatusInternalServerError)
				return
			}
			if !roomForUpload.IsActive || !hallForUpload.IsActive {
				http.Error(w, `{"error":"room or hall is inactive"}`, http.StatusBadRequest)
				return
			}

			// 25MB 제한: frontend 업로드 크기와 맞추려는 용도입니다.
			if err := r.ParseMultipartForm(25 << 20); err != nil {
				http.Error(w, `{"error":"multipart parse failed"}`, http.StatusBadRequest)
				return
			}

			file, header, err := r.FormFile("file")
			if err != nil {
				http.Error(w, `{"error":"file is required"}`, http.StatusBadRequest)
				return
			}
			defer file.Close()

			displaySize := strings.TrimSpace(r.FormValue("displaySize"))
			if displaySize != "INCH27" && displaySize != "INCH32" {
				displaySize = ""
			}

			// 업로드 시 선택한 인치로 room의 표시 방식을 갱신합니다.
			// (관리자는 27/32를 업로드 단계에서만 선택하기 때문에 이곳에서 반영합니다.)
			if displaySize != "" {
				_ = db.Model(&Room{}).Where("id = ?", roomId).Update("display_size", displaySize).Error
			}

			// UTF-8 한글 등 (PostgreSQL text / Go string)
			captionPtr := (*string)(nil)
			if v := strings.TrimSpace(r.FormValue("caption")); v != "" {
				c := v
				captionPtr = &c
			}

			sortOrder := 0
			if v := strings.TrimSpace(r.FormValue("sortOrder")); v != "" {
				if n, err := strconv.Atoi(v); err == nil {
					sortOrder = n
				}
			}

			if strings.TrimSpace(cfg.S3Bucket) == "" {
				http.Error(w, `{"error":"S3_BUCKET not configured"}`, http.StatusInternalServerError)
				return
			}

			// object key: roomId/uuid-safeFileName
			extName := safeFileName(header.Filename)
			objKey := path.Join(
				roomId,
				fmt.Sprintf("%s-%s-%s", time.Now().Format("20060102-150405"), uuid.NewString()[:8], extName),
			)

			contentType := header.Header.Get("Content-Type")
			if strings.TrimSpace(contentType) == "" {
				contentType = "application/octet-stream"
			}

			// 파일 내용을 메모리로 읽어 S3 PUT
			b, err := io.ReadAll(file)
			if err != nil {
				http.Error(w, `{"error":"file read failed"}`, http.StatusInternalServerError)
				return
			}

			_, err = cfg.S3.PutObject(context.Background(), &s3.PutObjectInput{
				Bucket: aws.String(cfg.S3Bucket),
				Key:    aws.String(objKey),
				Body:   bytes.NewReader(b),
				// Content-Length가 없으면 S3가 411로 거절합니다.
				ContentLength: aws.Int64(int64(len(b))),
				ContentType:   aws.String(contentType),
			})
			if err != nil {
				// 원인 추적을 위해 AWS SDK 에러 메시지를 함께 반환합니다.
				jsonResponse(w, http.StatusInternalServerError, map[string]any{
					"error":  "s3 put failed",
					"detail": err.Error(),
				})
				return
			}

			// CloudFront 기준 imageUrl
			imgURL := strings.TrimRight(cfg.ImagePublicBase, "/") + "/" + objKey

			slide := Slide{
				ID:        uuid.NewString(),
				RoomID:    roomId,
				S3Key:     objKey,
				ImageURL:  imgURL,
				Caption:   captionPtr,
				SortOrder: sortOrder,
			}
			if err := db.Create(&slide).Error; err != nil {
				http.Error(w, `{"error":"db error"}`, http.StatusInternalServerError)
				return
			}

			// 방금 업로드한 슬라이드를 room의 활성 슬라이드로 지정합니다.
			_ = db.Model(&Room{}).Where("id = ?", roomId).Update("active_slide_id", slide.ID).Error

			jsonResponse(w, http.StatusOK, map[string]any{"slide": slide})
		})

		secured.Delete("/rooms/{roomId}/slides/{slideId}", func(w http.ResponseWriter, r *http.Request) {
			roomID := chi.URLParam(r, "roomId")
			slideID := chi.URLParam(r, "slideId")
			if err := deleteSlideAndObject(r.Context(), db, &cfg, roomID, slideID); err != nil {
				http.Error(w, `{"error":"slide not found"}`, http.StatusNotFound)
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"ok": true})
		})
	})

	// =========================
	// Kiosk API (deviceKey 검증 + 슬라이드 반환)
	// =========================
	r.Get("/api/kiosk/room/{roomId}", func(w http.ResponseWriter, r *http.Request) {
		roomId := chi.URLParam(r, "roomId")
		if strings.TrimSpace(roomId) == "" {
			http.Error(w, `{"error":"roomId is required"}`, http.StatusBadRequest)
			return
		}

		var room Room
		if err := db.First(&room, "id = ?", roomId).Error; err != nil {
			http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
			return
		}
		if !room.IsActive {
			http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
			return
		}
		var hallKiosk Hall
		if err := db.First(&hallKiosk, "id = ?", room.HallID).Error; err != nil || !hallKiosk.IsActive {
			http.Error(w, `{"error":"room not found"}`, http.StatusNotFound)
			return
		}

		showCaption := room.DisplaySize == "INCH32"

		var active Slide
		if room.ActiveSlideID != nil && strings.TrimSpace(*room.ActiveSlideID) != "" {
			_ = db.First(&active, "id = ? AND room_id = ?", *room.ActiveSlideID, room.ID).Error
		}
		if active.ID == "" {
			_ = db.Where("room_id = ?", room.ID).
				Order("sort_order asc").
				First(&active).Error
		}

		jsonResponse(w, http.StatusOK, map[string]any{
			"ui": map[string]any{
				"showCaption": showCaption,
				"displaySize": room.DisplaySize,
			},
			"activeSlide": map[string]any{
				"id":       active.ID,
				"imageUrl": active.ImageURL,
				"caption":  active.Caption,
			},
		})
	})

	log.Printf("backend listening on :%d", cfg.Port)
	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
