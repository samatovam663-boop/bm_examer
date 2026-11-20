from rest_framework import serializers

MAX_IMAGE_BYTES = 2 * 1024 * 1024


def validate_image_size(image):
    if image and image.size > MAX_IMAGE_BYTES:
        raise serializers.ValidationError("Rasm hajmi 2 MB dan oshmasligi kerak.")
