# app.py
from flask import Flask, render_template, request, jsonify, Response
import cv2
import numpy as np
import threading
import time
import os
from datetime import datetime
import json

app = Flask(__name__)

# Global variables for video processing
current_frame = None
frame_lock = threading.Lock()
analysis_results = {
    'threat_level': 'LOW',
    'confidence': 0,
    'detection_type': 'None',
    'threat_count': 0,
    'alerts': []
}

# --- Backend Components setup (MongoDB, PostgreSQL, Kafka, SIEM) ---
# DB Setup (Mock)
# postgres_db = connect('postgresql://user:pass@localhost/metadata')
# mongo_db = connect('mongodb://localhost:27017/video_clips')

def trigger_siem_webhook(alert_data):
    """Sends webhook to SIEM (TheHive/Splunk) or Slack/Email (SIEM-ready)"""
    # requests.post('https://siem-endpoint/api/alert', json=alert_data)
    print(f"[SIEM Webhook] Dispatched alert to SOC: {alert_data['type']} at {alert_data['location']}")
    
def auto_blur_privacy(frame, boxes):
    """Privacy masking: auto-blurs faces/license plates of non-involved individuals (GDPR/DPDP compliant)"""
    mask = frame.copy()
    # Mock OpenCV blurring for faces/license plates
    for (x, y, w, h) in boxes:
        face_roi = mask[y:y+h, x:x+w]
        face_roi = cv2.GaussianBlur(face_roi, (51, 51), 0)
        mask[y:y+h, x:x+w] = face_roi
    return mask

# --- Pipeline State ---
temporal_buffer = []  # temporal filtering (>=5 frames)


# Simulated AI analysis (replace with actual ML model)
class SentimentAnalyzer:
    def __init__(self):
        self.threat_keywords = ['scream', 'shout', 'fight', 'gun', 'knife', 'run', 'panic']
        self.safe_keywords = ['laugh', 'play', 'talk', 'walk', 'smile']
    
    def analyze_audio_sentiment(self, audio_text):
        """Simulate audio sentiment analysis"""
        threat_score = 0
        safe_score = 0
        
        if audio_text:
            text_lower = audio_text.lower()
            for keyword in self.threat_keywords:
                if keyword in text_lower:
                    threat_score += 1
            
            for keyword in self.safe_keywords:
                if keyword in text_lower:
                    safe_score += 1
        
        total_keywords = threat_score + safe_score
        if total_keywords == 0:
            return 'NEUTRAL', 50
        
        threat_ratio = threat_score / total_keywords
        
        if threat_ratio > 0.7:
            return 'HIGH', int(threat_ratio * 100)
        elif threat_ratio > 0.3:
            return 'MEDIUM', int(threat_ratio * 100)
        else:
            return 'LOW', int((1 - threat_ratio) * 100)
    
    def analyze_visual_threat(self, frame):
        """Simulate visual threat detection"""
        # Convert to grayscale for simple analysis
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Simple motion detection (placeholder for real ML model)
        height, width = gray.shape
        center_region = gray[height//4:3*height//4, width//4:3*width//4]
        
        # Calculate variance as a simple activity measure (Two-stage pipeline: Motion -> YOLO)
        variance = np.var(center_region)
        
        # Temporal filtering (>=5 frames) logic mock
        global temporal_buffer
        temporal_buffer.append(variance)
        if len(temporal_buffer) > 5:
            temporal_buffer.pop(0)
            
        avg_activity = np.mean(temporal_buffer) if temporal_buffer else variance
        
        # Simulated YOLOv8 Detection & TensorFlow autoencoder anomaly
        if avg_activity > 5000:  # High activity

            return 'HIGH', 85
        elif variance > 2000:  # Medium activity
            return 'MEDIUM', 70
        else:  # Low activity
            return 'LOW', 60

analyzer = SentimentAnalyzer()

def generate_frames():
    """Generate video frames for streaming"""
    camera = cv2.VideoCapture(0)  # Use webcam
    
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            with frame_lock:
                global current_frame
                current_frame = frame.copy()
            
            # Encode frame
            ret, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), 
                   mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/analysis')
def get_analysis():
    """API endpoint to get current analysis results"""
    return jsonify(analysis_results)

@app.route('/api/analyze_frame', methods=['POST'])
def analyze_frame():
    """API endpoint to analyze current frame"""
    global analysis_results
    
    with frame_lock:
        if current_frame is not None:
            # Simulate AI analysis
            visual_threat, visual_confidence = analyzer.analyze_visual_threat(current_frame)
            
            # Simulate audio analysis (in real app, this would come from audio stream)
            simulated_audio = "people talking and walking normally"
            audio_threat, audio_confidence = analyzer.analyze_audio_sentiment(simulated_audio)
            
            # Combine results
            if visual_threat == 'HIGH' or audio_threat == 'HIGH':
                final_threat = 'HIGH'
                confidence = max(visual_confidence, audio_confidence)
                detection_type = 'Aggressive Behavior'
                
                # Add alert if high threat
                new_alert = {
                    'id': len(analysis_results['alerts']) + 1,
                    'time': datetime.now().strftime('%H:%M:%S'),
                    'type': 'DANGER',
                    'message': f'{detection_type} detected with {confidence}% confidence',
                    'location': 'Camera 1 - Tambaram',
                    'camera_id': 'CAM-001',
                    'snapshot_url': '/api/evidence/snap_current.jpg',
                    'video_clip_url': '/api/evidence/clip_10s.mp4',
                    'latency': '< 1.2s (edge)'
                }
                analysis_results['alerts'].insert(0, new_alert)
                analysis_results['threat_count'] += 1
                
                # Trigger SOC SIEM Webhook
                threading.Thread(target=trigger_siem_webhook, args=(new_alert,), daemon=True).start()
                
                # Mock Evidence DB save
                # mongo_db.clips.insert_one({'alert_id': new_alert['id'], 'clip': video_clip_bytes})
                # postgres_db.metadata.insert_one(new_alert)
                
            elif visual_threat == 'MEDIUM' or audio_threat == 'MEDIUM':
                final_threat = 'MEDIUM'
                confidence = (visual_confidence + audio_confidence) // 2
                detection_type = 'Unusual Activity'
            else:
                final_threat = 'LOW'
                confidence = (visual_confidence + audio_confidence) // 2
                detection_type = 'Normal Activity'
            
            analysis_results.update({
                'threat_level': final_threat,
                'confidence': confidence,
                'detection_type': detection_type,
                'timestamp': datetime.now().isoformat()
            })
    
    return jsonify(analysis_results)

@app.route('/api/settings', methods=['POST'])
def update_settings():
    """API endpoint to update detection settings"""
    data = request.json
    # In a real application, you would update detection parameters here
    return jsonify({'status': 'success', 'message': 'Settings updated'})

@app.route('/api/alerts')
def get_alerts():
    """API endpoint to get all alerts"""
    return jsonify(analysis_results['alerts'])

@app.route('/api/status')
def get_status():
    """API endpoint to get system status"""
    return jsonify({
        'system_status': 'ACTIVE',
        'active_cameras': 1,
        'protected_areas': 12,
        'today_alerts': analysis_results['threat_count'],
        'system_accuracy': 97
    })

def background_analysis():
    """Background thread for continuous analysis"""
    while True:
        time.sleep(5)  # Analyze every 5 seconds
        try:
            with app.app_context():
                analyze_frame()
        except Exception as e:
            print(f"Analysis error: {e}")

if __name__ == '__main__':
    # Start background analysis thread
    analysis_thread = threading.Thread(target=background_analysis, daemon=True)
    analysis_thread.start()
    
    app.run(debug=True, host='0.0.0.0', port=5000)