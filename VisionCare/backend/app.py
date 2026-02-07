import sqlite3
import os
import base64
import re
import cv2
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime

# --- App Setup ---
app = Flask(__name__)
CORS(app)  # Allows your frontend to talk to this backend

# --- Configuration ---
DATABASE = 'vision.db'
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Create uploads folder if it doesn't exist

# --- Database Setup ---
def init_db():
    print("Initializing database...")
    with sqlite3.connect(DATABASE) as conn:
        cursor = conn.cursor()
        
        # We use a simple Users table. For this example, we'll hardcode user_id=1
        # In a real app, you'd have a full login system.
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY,
            username TEXT NOT NULL
        )''')
        
        # Create AmslerResults table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS AmslerResults (
            result_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            test_date TIMESTAMP NOT NULL,
            image_path TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES Users (user_id)
        )''')
        
        # Add a dummy user if one doesn't exist
        cursor.execute("INSERT OR IGNORE INTO Users (user_id, username) VALUES (1, 'test_user')")
        conn.commit()
    print("Database initialized.")

# --- Helper Function to Decode Image ---
def save_image(base64_string, user_id):
    # Remove the "data:image/png;base64," part
    img_data = re.sub('^data:image/.+;base64,', '', base64_string)
    
    # Decode the image
    img_binary = base64.b64decode(img_data)
    
    # Create a unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"user_{user_id}_{timestamp}.png"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    # Save the file
    with open(filepath, 'wb') as f:
        f.write(img_binary)
        
    return filepath

# --- API Endpoint 1: Save a Test ---
@app.route('/save_test', methods=['POST'])
def save_test():
    # We will hardcode user_id=1 for this example.
    # A real app would get this from a login session.
    CURRENT_USER_ID = 1
    
    try:
        data = request.get_json()
        image_base64 = data['image']
        
        # Save the image file
        filepath = save_image(image_base64, CURRENT_USER_ID)
        
        # Save the path to the database
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO AmslerResults (user_id, test_date, image_path) VALUES (?, ?, ?)",
                (CURRENT_USER_ID, datetime.now(), filepath)
            )
            conn.commit()
            
        return jsonify({
            'success': True, 
            'message': 'Test saved successfully!'
        })
        
    except Exception as e:
        print(f"Error saving test: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# --- API Endpoint 2: Compare Tests (SMARTER VERSION) ---
@app.route('/compare_tests', methods=['GET'])
def compare_tests():
    CURRENT_USER_ID = 1  # Hardcoded user
    
    try:
        with sqlite3.connect(DATABASE) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT image_path FROM AmslerResults WHERE user_id = ? ORDER BY test_date DESC LIMIT 2",
                (CURRENT_USER_ID,)
            )
            results = cursor.fetchall()
        
        if len(results) < 2:
            return jsonify({
                'success': False, 
                'message': 'You need at least two saved tests to compare.'
            })
        
        new_test_path = results[0][0]
        old_test_path = results[1][0]
        
        # --- OpenCV Image Comparison (Smarter Logic) ---
        img_new = cv2.imread(new_test_path)
        img_old = cv2.imread(old_test_path)
        
        # Make sure they are the same size
        if img_new.shape != img_old.shape:
            img_old = cv2.resize(img_old, (img_new.shape[1], img_new.shape[0]))

        # Convert images to grayscale for comparison
        img_new_gray = cv2.cvtColor(img_new, cv2.COLOR_BGR2GRAY)
        img_old_gray = cv2.cvtColor(img_old, cv2.COLOR_BGR2GRAY)
        
        
        # --- [BUG FIX] ---
        # The logic is swapped here to correctly identify new vs. healed lines.
        
        # --- Find NEW distortions (Worsening) ---
        # Find where old image was white (255) AND new image is black (0)
        new_lines_mask = cv2.subtract(img_old_gray, img_new_gray) # <-- CORRECTED
        # Apply threshold to get a clean binary mask
        _, new_lines_mask = cv2.threshold(new_lines_mask, 25, 255, cv2.THRESH_BINARY)
        
        # --- Find "Healed" distortions (Disappeared) ---
        # Find where old image was black (0) AND new image is white (255)
        healed_lines_mask = cv2.subtract(img_new_gray, img_old_gray) # <-- CORRECTED
        # Apply threshold
        _, healed_lines_mask = cv2.threshold(healed_lines_mask, 25, 255, cv2.THRESH_BINARY)
        # --- [END OF BUG FIX] ---

    
        # --- Create the final comparison image ---
        # Start with the user's newest drawing
        final_image = img_new.copy()
        
        # Create color overlays
        red_overlay = np.zeros(final_image.shape, dtype=np.uint8)
        red_overlay[:] = (0, 0, 255)  # BGR for Red

        green_overlay = np.zeros(final_image.shape, dtype=np.uint8)
        green_overlay[:] = (0, 255, 0) # BGR for Green
        
        # Apply the RED overlay where distortions are NEW
        # This shows "DANGER! WORSENING!"
        final_image = cv2.bitwise_or(final_image, red_overlay, mask=new_lines_mask)

        # Apply the GREEN overlay where distortions are GONE
        # This shows "This area seems to have cleared"
        final_image = cv2.bitwise_or(final_image, green_overlay, mask=healed_lines_mask)
        
        # Save the new, smarter comparison image
        diff_filename = f"user_{CURRENT_USER_ID}_comparison.png"
        diff_filepath = os.path.join(UPLOAD_FOLDER, diff_filename)
        cv2.imwrite(diff_filepath, final_image)
        # --- End of OpenCV Logic ---

        return jsonify({
            'success': True,
            'message': 'Comparison complete. New distortions are RED. Cleared areas are GREEN.',
            'diff_image_url': f'uploads/{diff_filename}'
        })

    except Exception as e:
        print(f"Error comparing tests: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

# --- Endpoint to serve the saved images ---
# This allows the <img> tag in the frontend to find the image
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# --- Run the App ---
if __name__ == '__main__':
    init_db()  # Create the database and tables when the app starts
    app.run(debug=True, port=5000)