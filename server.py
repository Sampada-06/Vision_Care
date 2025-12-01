import cv2
import numpy as np
import time
import asyncio
import websockets

# --- CONFIGURATION CONSTANTS ---
FOCAL_LENGTH_GUESS = 800.0  # Or paste your tuned value here
FACE_AVG_WIDTH_CM = 14.0

class DistanceEstimator:
    def __init__(self, ideal_distance, focal_length_guess):
        self.ideal_distance = ideal_distance
        self.focal_length = focal_length_guess
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            raise IOError("Cannot open webcam")
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        self.mode = 'TUNE'
        self.countdown_start_time = 0

    def _draw_text(self, frame, text, y_pos, color=(0, 0, 255), x_pos=15):
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.7
        thickness = 2
        text_size, _ = cv2.getTextSize(text, font, font_scale, thickness)
        text_w, text_h = text_size
        overlay = frame.copy()
        cv2.rectangle(overlay, (x_pos - 5, y_pos - text_h - 5), (x_pos + text_w + 5, y_pos + 10), (0, 0, 0), -1)
        alpha = 0.6
        frame = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
        cv2.putText(frame, text, (x_pos, y_pos), font, font_scale, color, thickness)
        return frame

    async def run(self):
        print("\n--- STEP 1: CAMERA TUNING ---")
        print("1. Get a ruler and sit at a KNOWN distance (e.g., 50cm).")
        print("2. Use UP/DOWN ARROW KEYS to make the number on screen match the ruler.")
        print("3. When it's accurate, press 's' to SAVE and start the test.")
        print("4. Press 'q' to quit.")

        calibration_complete = False

        while not calibration_complete:
            ret, frame = self.cap.read()
            if not ret:
                break
            
            h, w, _ = frame.shape
            center_x = w // 2
            key = cv2.waitKey(10) & 0xFF 

            if key == ord('q'):
                break

            # ... (All the face detection, guidance, and mode logic from your last script) ...
            # [I am copying the exact logic from our previous Python script here]
            
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)
            distance_cm = 0
            guidance_text = ""
            color = (0, 0, 255)
            is_perfect = False

            if len(faces) > 0:
                (x, y, fw, fh) = max(faces, key=lambda item: item[2] * item[3])
                cv2.rectangle(frame, (x, y), (x + fw, y + fh), (255, 200, 0), 3)
                distance_cm = (FACE_AVG_WIDTH_CM * self.focal_length) / fw
                
                tolerance = 5.0
                if distance_cm < self.ideal_distance - tolerance:
                    guidance_text = "Move Farther"
                    color = (0, 100, 255)
                elif distance_cm > self.ideal_distance + tolerance:
                    guidance_text = "Move Closer"
                    color = (0, 100, 255)
                else:
                    guidance_text = "Perfect Distance! Hold Still..."
                    color = (0, 255, 0)
                    is_perfect = True
                
                face_center_x = x + fw // 2
                if face_center_x < center_x - 60:
                    guidance_text += " | Move Right"
                elif face_center_x > center_x + 60:
                    guidance_text += " | Move Left"

            if self.mode == 'TUNE':
                if key == 82: self.focal_length += 10
                elif key == 84: self.focal_length -= 10
                elif key == ord('s'):
                    self.mode = 'GUIDE'
                    print(f"\n--- Tuning Locked! Final Focal Length: {self.focal_length:.2f} ---")
                    print("\n--- STEP 2: POSITIONING ---")
                
                if len(faces) > 0:
                    frame = self._draw_text(frame, f"Distance: {int(distance_cm)} cm", 30, (0, 255, 0))
                frame = self._draw_text(frame, f"Tune Focal Length: {self.focal_length:.0f}", h - 60, (255, 255, 0))
                frame = self._draw_text(frame, "Use UP/DOWN Arrows. Press 's' to Save.", h - 30, (255, 255, 0))

            elif self.mode == 'GUIDE':
                if len(faces) > 0:
                    frame = self._draw_text(frame, f"Distance: {int(distance_cm)} cm", 30, (0, 255, 0))
                    frame = self._draw_text(frame, guidance_text, 70, color)
                    if is_perfect:
                        self.mode = 'COUNTDOWN'
                        self.countdown_start_time = time.time()
                else:
                    frame = self._draw_text(frame, "Looking for face...", 30)

            elif self.mode == 'COUNTDOWN':
                if not is_perfect:
                    self.mode = 'GUIDE'
                    frame = self._draw_text(frame, "You moved! Reposition...", 70, (0,0,255))
                else:
                    elapsed_time = time.time() - self.countdown_start_time
                    countdown_sec = 5 - int(elapsed_time)
                    if countdown_sec > 0:
                        frame = self._draw_text(frame, guidance_text, 70, color)
                        text = f"{countdown_sec}"
                        text_size, _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 6.0, 10)
                        text_w, text_h = text_size
                        text_x = (w - text_w) // 2
                        text_y = (h + text_h) // 2
                        cv2.putText(frame, text, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 6.0, (0, 255, 0), 10)
                    else:
                        print("Distance locked. Sending 'OK' to website...")
                        calibration_complete = True # Flag to exit loop
            
            cv2.imshow("Eye Test Distance Guide", frame)
                
        # --- Cleanup ---
        self.cap.release()
        cv2.destroyAllWindows()
        return calibration_complete

# --- WebSocket Server Logic ---
async def calibration_handler(websocket):
    """
    Handles a new connection from the website.
    """
    print("Website connected. Starting calibration...")
    
    # 1. Get screen size from website
    screen_size_msg = await websocket.recv()
    screen_size_inch = float(screen_size_msg)
    print(f"Received screen size: {screen_size_inch} inches")
    ideal_distance_cm = screen_size_inch * 2.54 * 2.5
    print(f"Ideal distance: {int(ideal_distance_cm)} cm")

    # 2. Run the OpenCV Distance Estimator
    estimator = DistanceEstimator(
        ideal_distance=ideal_distance_cm,
        focal_length_guess=FOCAL_LENGTH_GUESS
    )
    success = await estimator.run() # This will run the OpenCV loop

    # 3. Send the "OK" signal back to the website
    if success:
        await websocket.send("CALIBRATION_OK")
        print("'OK' signal sent. Python job is done.")
    else:
        print("User quit calibration.")

# --- Main function to start the server ---
async def main():
    host = "localhost"
    port = 8765
    print(f"--- Python Calibration Server ---")
    print(f"Listening for website connection on ws://{host}:{port}")
    print("Run this script first, then open your index.html file.")
    async with websockets.serve(calibration_handler, host, port):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer shut down.")