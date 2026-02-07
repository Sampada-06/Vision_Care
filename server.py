import cv2
import time
import asyncio
import websockets

# ---------------- CONFIG ----------------
FOCAL_LENGTH_GUESS = 800.0
FACE_AVG_WIDTH_CM = 14.0
HOST = "127.0.0.1"
PORT = 8080   # ← changed port (important)
# ----------------------------------------


class DistanceEstimator:
    def __init__(self, ideal_distance, focal_length_guess):
        self.ideal_distance = ideal_distance
        self.focal_length = focal_length_guess

        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            raise IOError("Cannot open webcam")

        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

        self.mode = "TUNE"
        self.countdown_start = None
        self.prev_fw = None

    def _draw_text(self, frame, text, y, color=(0, 255, 0)):
        cv2.rectangle(frame, (10, y - 30), (620, y + 10), (0, 0, 0), -1)
        cv2.putText(
            frame,
            text,
            (15, y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2,
        )

    async def run(self):
        print("\n--- STEP 1: FOCAL LENGTH TUNING ---")
        print("Sit at a known distance.")
        print("Use W / S to adjust focal length.")
        print("Press ENTER to lock.")
        print("Press Q to quit.\n")

        while True:
            ret, frame = self.cap.read()
            if not ret:
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)

            distance_cm = None
            guidance = "No face detected"
            color = (0, 0, 255)
            is_perfect = False

            if len(faces) > 0:
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                cv2.rectangle(frame, (x, y), (x + fw, y + fh), (255, 200, 0), 2)

                if self.prev_fw is None:
                    self.prev_fw = fw
                fw = int(0.7 * fw + 0.3 * self.prev_fw)
                self.prev_fw = fw

                distance_cm = (FACE_AVG_WIDTH_CM * self.focal_length) / fw
                tol = 5

                if distance_cm < self.ideal_distance - tol:
                    guidance = "Move Farther"
                elif distance_cm > self.ideal_distance + tol:
                    guidance = "Move Closer"
                else:
                    guidance = "Perfect - Hold Still"
                    color = (0, 255, 0)
                    is_perfect = True

            key = cv2.waitKey(10) & 0xFF

            if key == ord("q"):
                self.cleanup()
                return False

            if self.mode == "TUNE":
                if key == ord("w"):
                    self.focal_length += 10
                elif key == ord("s"):
                    self.focal_length -= 10
                elif key == 13:  # ENTER
                    self.mode = "GUIDE"
                    print(f"Focal Length Locked: {self.focal_length:.1f}")

                self._draw_text(frame, f"Focal Length: {int(self.focal_length)}", 40)
                if distance_cm:
                    self._draw_text(frame, f"Distance: {int(distance_cm)} cm", 80)

            elif self.mode == "GUIDE":
                if distance_cm:
                    self._draw_text(frame, f"Distance: {int(distance_cm)} cm", 40)
                    self._draw_text(frame, guidance, 80, color)

                    if is_perfect:
                        self.mode = "COUNTDOWN"
                        self.countdown_start = time.time()

            elif self.mode == "COUNTDOWN":
                if not is_perfect:
                    self.mode = "GUIDE"
                else:
                    elapsed = time.time() - self.countdown_start
                    remaining = 5 - int(elapsed)

                    if remaining > 0:
                        self._draw_text(frame, f"Hold Still: {remaining}", 80, color)
                    else:
                        print("Distance locked.")
                        self.cleanup()
                        return True

            cv2.imshow("Eye Test Distance Calibration", frame)

        self.cleanup()
        return False

    def cleanup(self):
        self.cap.release()
        cv2.destroyAllWindows()


# ---------------- WEBSOCKET ----------------

async def calibration_handler(websocket):
    print("Website connected")

    screen_size_inch = float(await websocket.recv())
    ideal_distance_cm = screen_size_inch * 2.54 * 2.5

    print(f"Screen size: {screen_size_inch} inch")
    print(f"Ideal distance: {int(ideal_distance_cm)} cm")

    estimator = DistanceEstimator(
        ideal_distance=ideal_distance_cm,
        focal_length_guess=FOCAL_LENGTH_GUESS,
    )

    success = await estimator.run()

    if success:
        await websocket.send("CALIBRATION_OK")
        print("CALIBRATION_OK sent")
    else:
        print("Calibration cancelled")


# ---------------- MAIN ----------------

async def main():
    print("--- Python Calibration Server ---")
    print(f"Listening on ws://{HOST}:{PORT}")

    async with websockets.serve(calibration_handler, HOST, PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer shut down cleanly")
