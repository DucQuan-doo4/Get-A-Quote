#  Kiến Trúc Hệ Thống Get-A-Request

Tài liệu này mô tả toàn bộ kiến trúc, luồng nghiệp vụ, hạ tầng AWS và CI/CD của ứng dụng **Get-A-Request** theo mô hình chuẩn doanh nghiệp.

---

##  1. Tổng Quan Hệ Thống

Ứng dụng bao gồm:

* **Front-end** (S3 + CloudFront)
* **Back-end API** (ECS Fargate + ALB)
* **Database** (Amazon RDS MySQL)
* **Quản trị hệ thống & phân tích log**
* **DBA kết nối bảo mật qua Bastion Host**
* **CI/CD Jenkins chạy trên EC2 và tích hợp GitHub Webhook**

---

##  2. Sơ Đồ Kiến Trúc Hệ Thống

![System Architecture](./images/get.png)

---

##  3. Luồng Nghiệp Vụ

Hệ thống bao gồm **4 luồng hoạt động chính**:

---

### 🔹 **Luồng 1 – Người dùng truy cập giao diện (Front-end)**

Người dùng truy cập website nhanh chóng và an toàn từ mọi nơi.

**Luồng dữ liệu:**

```
Client → Route 53 / CloudFront → S3
```

* CloudFront làm CDN tăng tốc và bảo mật.
* Website tĩnh được lưu trên S3.
* Route 53 (optional) cấu hình domain tùy theo nhu cầu.

---

### 🔹 **Luồng 2 – Người dùng gửi Yêu cầu (Back-end API)**

Khách hàng nhập thông tin, API xử lý và lưu vào CSDL.

**Luồng dữ liệu:**

```
Client → CloudFront (cache) → ALB → ECS Task (API) → RDS MySQL
```

* ALB định tuyến request đến ECS.
* ECS chạy container API.
* Dữ liệu được lưu an toàn vào RDS.

---

### 🔹 **Luồng 3 – Quản trị viên xem Log truy cập**

Dùng cho mục đích bảo mật và phân tích hành vi người dùng.

**Luồng dữ liệu:**

```
Admin → S3 Bucket (CloudFront Logs)
```

* CloudFront ghi log vào S3 tự động.
* Admin xem log thông qua IAM policy.

---

### 🔹 **Luồng 4 – DBA quản trị cơ sở dữ liệu**

Bảo đảm kết nối **không lộ ra Internet**.

**Luồng dữ liệu:**

```
Admin → SSH → Bastion Host → MySQL Client → RDS
```

* Bastion Host nằm trong Public Subnet.
* RDS nằm trong Private Subnet.
* DBA chỉ kết nối qua SSH tunnel.

---

## 4. Thành phần AWS

* Route 53 – DNS
* CloudFront – CDN + Cache
* S3 – Static hosting & logs
* VPC – Public & Private Subnet
* ALB – Reverse proxy cho API
* ECS Fargate – API container
* ECR – Lưu Docker image
* RDS MySQL – Cơ sở dữ liệu
* Bastion Host – SSH access
* IAM – Bảo mật truy cập
* CloudWatch – Monitoring
* CloudTrail – Audit logs

---

##  5. CI/CD Pipeline với Jenkins (EC2)

Hệ thống sử dụng **một EC2 riêng** chạy Jenkins.

### Luồng hoạt động CI/CD:

```
GitHub → Webhook → Jenkins EC2 → Build Docker Image → Push ECR → ECS Deploy
```

### Quy trình chi tiết:

1. Developer push code lên GitHub
2. GitHub gửi Webhook đến Jenkins
3. Jenkins pull source và build Docker image
4. Jenkins push image lên Amazon ECR
5. Jenkins chạy lệnh cập nhật ECS Service
6. ECS thực hiện rolling update

### Jenkinsfile mẫu:

```groovy
pipeline {
    agent any
    environment {
        AWS_REGION = "..."
        ECR_REPO = "...."
        CLUSTER_NAME = "..."
        SERVICE_NAME = "..."
        CONTAINER_NAME = "..." //thay thế toàn bộ các dấu ... bằng các thông tin tương ứng
        IMAGE_TAG = ""   // khai báo trước để dùng toàn pipeline
        TASK_DEF_ARN = "" // khai báo luôn
    }
    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: '...'
            }
        }

        stage('Get Commit Hash') {
            steps {
                script {
                    IMAGE_TAG = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
                    echo "Using image tag: ${IMAGE_TAG}"
                }
            }
        }

        stage('Build Docker') {
            steps {
                sh "docker build -t exam2:${IMAGE_TAG} ."
            }
        }

        stage('Login to ECR') {
            steps {
                withCredentials([usernamePassword(credentialsId: '#thay bang credential tao trong jenkins UI', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                    sh "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPO}"
                }
            }
        }

        stage('Tag & Push') {
            steps {
                sh "docker tag exam2:${IMAGE_TAG} ${ECR_REPO}:${IMAGE_TAG}"  #thay bang ten cua repo ecr
                sh "docker push ${ECR_REPO}:${IMAGE_TAG}"
            }
        }

        stage('Register ECS Task Definition') {
            steps {
                withCredentials([usernamePassword(credentialsId: '#ten credential', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                    script {
                        def taskDefFile = "ecs-task-def-${IMAGE_TAG}.json"
                        sh "sed 's|<IMAGE_TAG>|${IMAGE_TAG}|g' ecs-task-def-template.json > ${taskDefFile}"
                        TASK_DEF_ARN = sh(script: "aws ecs register-task-definition --cli-input-json file://${taskDefFile} --query taskDefinition.taskDefinitionArn --output text", returnStdout: true).trim()
                        echo "TASK_DEF_ARN: ${TASK_DEF_ARN}"
                    }
                }
            }
        }

        stage('Deploy ECS') {
            steps {
                withCredentials([usernamePassword(credentialsId: '#credential_tao_jenkinsUI', 
                                                  usernameVariable: 'AWS_ACCESS_KEY_ID', 
                                                  passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                    script {
                        sh """
                        aws ecs update-service \
                            --cluster ${CLUSTER_NAME} \
                            --service ${SERVICE_NAME} \
                            --task-definition ${TASK_DEF_ARN} \
                            --force-new-deployment
                        """
                    }
                }
            }
        }

    } // <-- đóng stages

    post {
        success {
            echo "CI/CD pipeline completed successfully!"
        }
        failure {
            echo "Pipeline failed! Check logs."
        }
    }

} // <-- đóng pipeline
```

##  6. API Endpoints

POST    /api/v1/get-a-request
GET     /api/v1/get-a-request/:id
PUT     /api/v1/get-a-request/:id
DELETE  /api/v1/get-a-request/:id


## 7. Ghi chú triển khai

* ECS production nên đặt trong private subnet nhưng trong lab này ở môi trường dev/test nên có thể để ở public subnet.
* RDS luôn nằm private subnet.
* Bastion Host chỉ mở SSH từ IP admin.
* Jenkins EC2 nên tách security group riêng và hạn chế SSH.


